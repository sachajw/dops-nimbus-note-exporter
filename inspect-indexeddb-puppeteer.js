#!/usr/bin/env node
/*
Connect to Nimbus Note via Puppeteer and dump IndexedDB
Uses puppeteer-core to connect to existing Chrome instance
*/

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CDP_PORT = 9222;

async function dumpIndexedDB() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Nimbus Note IndexedDB Dumper via Puppeteer                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let browser;

  try {
    // Connect to existing Chrome instance
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${CDP_PORT}`,
    });

    console.log('✓ Connected to Chrome instance');

    const pages = await browser.pages();
    console.log(`  Found ${pages.length} pages`);

    // Find the Nimbus page
    const nimbusPage = pages.find(p =>
      p.url().includes('nimbusweb.me')
    );

    if (!nimbusPage) {
      console.error('✗ Could not find Nimbus Note page');
      console.log('\nAvailable pages:');
      pages.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.url()}`);
      });
      process.exit(1);
    }

    console.log(`✓ Found Nimbus page: ${nimbusPage.url().substring(0, 60)}...\n`);

    // Get all databases
    console.log('Step 1: Enumerating databases...\n');
    const databases = await nimbusPage.evaluate(async () => {
      return await indexedDB.databases();
    });

    console.log(`Found ${databases.length} database(s):`);
    databases.forEach((db, i) => {
      console.log(`  ${i + 1}. ${db.name} (version ${db.version})`);
    });
    console.log('');

    // For each database, get object store info
    const allData = {};

    for (const db of databases) {
      console.log(`Scanning: ${db.name}...`);

      const result = await nimbusPage.evaluate(async (dbName, dbVersion) => {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(dbName, dbVersion);

          request.onsuccess = () => {
            const db = request.result;
            const output = { stores: {} };

            const transaction = db.transaction(db.objectStoreNames, 'readonly');

            // Use getAllKeys with a limit to avoid timeout
            const storePromises = Array.from(db.objectStoreNames).map((storeName) => {
              return new Promise((resolveStore) => {
                try {
                  const store = transaction.objectStore(storeName);

                  // Get count first
                  const countReq = store.count();
                  countReq.onsuccess = () => {
                    const count = countReq.result;

                    // Get a sample of keys (max 100)
                    const keysReq = store.getAllKeys();
                    keysReq.onsuccess = () => {
                      const allKeys = keysReq.result;
                      const sampleKeys = allKeys.slice(0, 100);

                      output.stores[storeName] = {
                        count,
                        totalKeys: allKeys.length,
                        sampleKeys
                      };

                      resolveStore();
                    };

                    keysReq.onerror = () => {
                      output.stores[storeName] = { count, error: 'getAllKeys failed' };
                      resolveStore();
                    };
                  };

                  countReq.onerror = () => {
                    output.stores[storeName] = { count: -1, error: 'count failed' };
                    resolveStore();
                  };
                } catch (e) {
                  output.stores[storeName] = { count: -1, error: e.message };
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

            transaction.onerror = () => {
              reject(transaction.error);
            };
          };

          request.onerror = () => {
            reject(request.error);
          };
        });
      }, db.name, db.version);

      allData[db.name] = {
        version: db.version,
        ...result
      };

      // Print summary
      for (const [storeName, storeData] of Object.entries(result.stores)) {
        if (storeData.error) {
          console.log(`  • ${storeName}: Error - ${storeData.error}`);
        } else {
          console.log(`  • ${storeName}: ${storeData.count} entries`);
          if (storeData.totalKeys > 0) {
            const keySample = storeData.sampleKeys.slice(0, 3).map(k =>
              typeof k === 'string' ? k.substring(0, 30) : String(k).substring(0, 30)
            ).join(', ');
            console.log(`    → Sample keys: ${keySample}...`);
          }
        }
      }
      console.log('');
    }

    // Save results
    const outputDir = path.join(process.cwd(), 'nimbus-indexeddb-dump');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, 'indexeddb-scan.json');
    fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2));

    console.log(`✓ Results saved to: ${outputFile}`);

  } catch (err) {
    if (err.message.includes('connect')) {
      console.error('\n✗ Could not connect to Chrome.');
      console.error('\nMake sure Nimbus Note is running with: --remote-debugging-port=9222');
    } else {
      console.error('✗ Error:', err.message);
    }
    console.error(err.stack);
    throw err;
  } finally {
    if (browser) {
      await browser.disconnect();
    }
  }
}

dumpIndexedDB().catch(err => {
  console.error('✗ Fatal error:', err.message);
  process.exit(1);
});
