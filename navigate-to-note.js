#!/usr/bin/env node
/*
Navigate to a specific note page to see if content gets cached in IndexedDB
*/

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CDP_PORT = 9222;

async function navigateToNote() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Navigate to Note and Check IndexedDB                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Load note IDs
  const noteIdsPath = path.join(process.cwd(), 'nimbus-local-data/note-ids.json');
  let noteIds = [];

  if (fs.existsSync(noteIdsPath)) {
    const content = fs.readFileSync(noteIdsPath, 'utf-8');
    noteIds = JSON.parse(content);
  }

  const noteId = noteIds[0] || 'Vr39GejFYXUsK3xb';
  console.log(`Using note ID: ${noteId}\n`);

  let browser;

  try {
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${CDP_PORT}`,
    });

    const pages = await browser.pages();
    const nimbusPage = pages.find(p => p.url().includes('nimbusweb.me'));

    if (!nimbusPage) {
      console.error('✗ Could not find Nimbus page');
      process.exit(1);
    }

    // Check IndexedDB before navigation
    console.log('Step 1: Checking IndexedDB before navigation...\n');
    const beforeCount = await nimbusPage.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('FusebaseIDB', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const store = db.transaction(['pages'], 'readonly').objectStore('pages');
      const count = await new Promise((resolve) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(-1);
      });

      db.close();
      return count;
    });

    console.log(`  IndexedDB entries: ${beforeCount}\n`);

    // Navigate to the note page
    console.log(`Step 2: Navigating to note ${noteId}...\n`);

    const noteUrl = `https://sachajw.nimbusweb.me/note/${noteId}`;
    console.log(`  URL: ${noteUrl}\n`);

    await nimbusPage.goto(noteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for content to load
    console.log('Waiting for content to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\nStep 3: Checking IndexedDB after navigation...\n');
    const afterCount = await nimbusPage.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('FusebaseIDB', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const store = db.transaction(['pages'], 'readonly').objectStore('pages');
      const count = await new Promise((resolve) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(-1);
      });

      db.close();
      return count;
    });

    console.log(`  IndexedDB entries: ${afterCount}\n`);

    if (afterCount > beforeCount) {
      console.log(`✓ Added ${afterCount - beforeCount} new entries to IndexedDB!`);

      // Get the new entry
      console.log('\nGetting new entry...\n');
      const newEntry = await nimbusPage.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('FusebaseIDB', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        const store = db.transaction(['pages'], 'readonly').objectStore('pages');
        const all = await new Promise((resolve) => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve([]);
        });

        db.close();
        return all;
      });

      // Find the entry for our note
      const noteEntry = newEntry.find(e => e.id && e.id.includes(noteId));

      if (noteEntry) {
        console.log('Found entry for this note!');
        console.log('Entry structure:');
        console.log(`  ID: ${noteEntry.id}`);
        console.log(`  UpdatedAt: ${noteEntry.updatedAt}`);

        if (noteEntry.dump) {
          const dumpKeys = Object.keys(noteEntry.dump).length;
          console.log(`  Dump size: ${dumpKeys} keys`);

          // Look for readable strings in the dump
          const readableStrings = [];
          for (let i = 0; i < Math.min(500, dumpKeys); i++) {
            const val = noteEntry.dump[i];
            if (typeof val === 'number' && val > 32 && val < 127) {
              readableStrings.push(String.fromCharCode(val));
            }
          }

          if (readableStrings.length > 10) {
            const preview = readableStrings.join('').substring(0, 200);
            console.log(`  Preview: ${preview}...`);
          }
        }

        // Save entry
        const outputDir = path.join(process.cwd(), 'nimbus-indexeddb-dump');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const outputFile = path.join(outputDir, `note-${noteId}.json`);
        fs.writeFileSync(outputFile, JSON.stringify(noteEntry, null, 2));
        console.log(`\n✓ Saved to: ${outputFile}`);
      } else {
        console.log('Could not find entry for this note in IndexedDB');
      }
    } else {
      console.log('✗ No new entries added to IndexedDB');
      console.log('\nThis confirms that note content is NOT cached locally.');
      console.log('Notes are fetched from the server on demand.');
    }

  } catch (err) {
    console.error('✗ Error:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.disconnect();
    }
  }
}

navigateToNote().catch(err => {
  console.error('✗ Fatal error:', err.message);
  process.exit(1);
});
