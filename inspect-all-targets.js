#!/usr/bin/env node
/*
Check all CDP targets for IndexedDB data
*/

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CDP_PORT = 9222;

async function checkAllTargets() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Checking All CDP Targets for IndexedDB                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let browser;

  try {
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${CDP_PORT}`,
    });

    console.log('✓ Connected to Chrome instance\n');

    const pages = await browser.pages();
    console.log(`Found ${pages.length} pages:\n`);

    const allResults = {};

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const url = page.url();

      console.log(`[${i + 1}/${pages.length}] ${url.substring(0, 70)}`);

      try {
        // Check if this page has IndexedDB
        const databases = await page.evaluate(async () => {
          try {
            return await indexedDB.databases();
          } catch (e) {
            return [];
          }
        });

        if (databases.length > 0) {
          console.log(`  → Found ${databases.length} database(s)`);

          const pageResults = {};

          for (const db of databases) {
            console.log(`     • ${db.name} (v${db.version})`);

            const result = await page.evaluate(async (dbName, dbVersion) => {
              return new Promise((resolve, reject) => {
                const request = indexedDB.open(dbName, dbVersion);

                request.onsuccess = () => {
                  const db = request.result;
                  const output = { stores: {} };

                  const transaction = db.transaction(db.objectStoreNames, 'readonly');

                  const storePromises = Array.from(db.objectStoreNames).map((storeName) => {
                    return new Promise((resolveStore) => {
                      try {
                        const store = transaction.objectStore(storeName);
                        const countReq = store.count();
                        countReq.onsuccess = () => {
                          output.stores[storeName] = { count: countReq.result };

                          // Get a sample entry
                          const getReq = store.getAll();
                          getReq.onsuccess = () => {
                            const allData = getReq.result;
                            if (allData && allData.length > 0) {
                              output.stores[storeName].sample = allData.slice(0, 2);
                            }
                            resolveStore();
                          };
                          getReq.onerror = () => resolveStore();
                        };
                        countReq.onerror = () => resolveStore();
                      } catch (e) {
                        resolveStore();
                      }
                    });
                  });

                  Promise.all(storePromises).then(() => {
                    transaction.oncomplete = () => {
                      db.close();
                      resolve(output);
                    };
                  });
                };
                request.onerror = () => resolve({});
              });
            }, db.name, db.version);

            pageResults[db.name] = {
              version: db.version,
              ...result
            };

            for (const [storeName, storeData] of Object.entries(result.stores)) {
              console.log(`       - ${storeName}: ${storeData.count} entries`);
            }
          }

          allResults[url] = pageResults;
        }
      } catch (e) {
        console.log(`  → Error: ${e.message}`);
      }

      console.log('');
    }

    // Save results
    const outputDir = path.join(process.cwd(), 'nimbus-indexeddb-dump');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, 'all-targets-scan.json');
    fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));

    console.log(`✓ Results saved to: ${outputFile}`);

  } catch (err) {
    console.error('✗ Error:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.disconnect();
    }
  }
}

checkAllTargets().catch(err => {
  console.error('✗ Fatal error:', err.message);
  process.exit(1);
});
