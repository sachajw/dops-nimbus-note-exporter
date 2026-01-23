#!/usr/bin/env node
/*
Get the single IndexedDB entry to see what format it uses
*/

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CDP_PORT = 9222;

async function getSingleEntry() {
  console.log('Getting single IndexedDB entry...\n');

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

    // Get the single entry
    const result = await nimbusPage.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('FusebaseIDB', 1);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['pages'], 'readonly');
          const store = transaction.objectStore('pages');

          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            db.close();
            resolve(getAllReq.result);
          };
          getAllReq.onerror = () => {
            db.close();
            reject(getAllReq.error);
          };
        };
        request.onerror = () => {
          reject(request.error);
        };
      });
    });

    console.log('Entry data:');
    console.log(JSON.stringify(result[0], null, 2));

    // Save to file
    const outputDir = path.join(process.cwd(), 'nimbus-indexeddb-dump');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, 'single-entry.json');
    fs.writeFileSync(outputFile, JSON.stringify(result[0], null, 2));

    console.log(`\n✓ Saved to: ${outputFile}`);

  } catch (err) {
    console.error('✗ Error:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.disconnect();
    }
  }
}

getSingleEntry().catch(err => {
  console.error('✗ Fatal error:', err.message);
  process.exit(1);
});
