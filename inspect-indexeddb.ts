#!/usr/bin/env node
/*
Inspect Nimbus Note IndexedDB via Chrome DevTools Protocol
This script connects to a running Nimbus Note desktop client and dumps IndexedDB data
*/

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function inspectNimbusIndexedDB() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Nimbus Note IndexedDB Inspector                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('Requirements:');
  console.log('1. Nimbus Note desktop client must be running');
  console.log('2. Run: npm install playwright');
  console.log('\nStarting Chrome DevTools connection...\n');

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--remote-debugging-port=9222',
      `--user-data-dir=${process.env.HOME}/Library/Application Support/nimbus-note-desktop`
    ],
    timeout: 30000,
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to Nimbus web app (should use existing session)
    await page.goto(`https://sachajw.nimbusweb.me`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    console.log('✓ Connected to Nimbus Note\n');

    // Get all IndexedDB databases
    const databases = await page.evaluate(async () => {
      const databases = await indexedDB.databases();
      return databases;
    });

    console.log(`Found ${databases.length} IndexedDB databases:`);
    databases.forEach((db, i) => {
      console.log(`  ${i + 1}. ${db.name} (version ${db.version})`);
    });

    // Dump data from each database
    const outputDir = path.join(process.cwd(), 'nimbus-indexeddb-dump');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const db of databases) {
      console.log(`\nDumping: ${db.name}...`);

      const data = await page.evaluate(async (dbName) => {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(dbName);
          request.onsuccess = () => {
            const db = request.result;
            const result: any = {};

            // Iterate through all object stores
            const transaction = db.transaction(db.objectStoreNames, 'readonly');
            const stores = db.objectStoreNames;

            let completed = 0;
            const total = stores.length;

            stores.forEach((storeName: string) => {
              const objectStore = transaction.objectStore(storeName);
              const getAll = objectStore.getAll();

              getAll.onsuccess = () => {
                result[storeName] = getAll.result;
                completed++;
                if (completed === total) {
                  db.close();
                  resolve(result);
                }
              };

              getAll.onerror = () => {
                // Continue even if one store fails
                completed++;
                if (completed === total) {
                  db.close();
                  resolve(result);
                }
              };
            });

            transaction.onerror = () => reject(transaction.error);
          };
          request.onerror = () => reject(request.error);
        });
      }, db.name);

      // Save to file
      const filename = `${db.name.replace(/[^a-z0-9]/gi, '_')}.json`;
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));

      const entryCount = Object.values(data).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      console.log(`  → Saved ${filename} (${entryCount} entries)`);
    }

    console.log(`\n✓ IndexedDB data saved to: ${outputDir}\n`);
    console.log('You can now examine the data to find note content.');

  } finally {
    await browser.close();
  }
}

inspectNimbusIndexedDB().catch(err => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});
