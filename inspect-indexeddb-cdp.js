#!/usr/bin/env node
/*
Connect to Nimbus Note Electron app via Chrome DevTools Protocol and dump IndexedDB
*/

const fs = require('fs');
const path = require('path');
const CDP = require('chrome-remote-interface');

const CDP_PORT = 9222;

async function dumpIndexedDB() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Nimbus Note IndexedDB Dumper via CDP                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let client;

  try {
    // Connect to CDP and get the list of targets
    const targets = await CDP.List({ port: CDP_PORT });
    console.log(`Found ${targets.length} targets:`);

    // Find the Nimbus web app target
    const nimbusTarget = targets.find(t =>
      t.url.includes('nimbusweb.me') ||
      t.title.includes('Nimbus')
    );

    if (!nimbusTarget) {
      console.error('✗ Could not find Nimbus Note target');
      console.log('\nAvailable targets:');
      targets.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.title} (${t.url})`);
      });
      process.exit(1);
    }

    console.log(`\n✓ Found target: ${nimbusTarget.title}`);
    console.log(`  URL: ${nimbusTarget.url}`);
    console.log(`  ID: ${nimbusTarget.id}\n`);

    // Connect to the target
    client = await CDP({ target: nimbusTarget, port: CDP_PORT });

    const { Runtime, Page } = client;

    // Enable necessary domains
    await Runtime.enable();

    console.log('✓ Connected to Chrome DevTools Protocol\n');

    // Execute JavaScript to dump IndexedDB
    const dumpScript = `
      (async () => {
        try {
          // Get all databases
          const databases = await indexedDB.databases();
          const allData = {};

          for (const dbInfo of databases) {
            allData[dbInfo.name] = {
              version: dbInfo.version,
              objectStores: {}
            };

            await new Promise((resolve, reject) => {
              const request = indexedDB.open(dbInfo.name, dbInfo.version);

              request.onupgradeneeded = () => {
                // Database upgrade handling
              };

              request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction(db.objectStoreNames, 'readonly');

                let completed = 0;
                const total = db.objectStoreNames.length;

                db.objectStoreNames.forEach((storeName) => {
                  const store = transaction.objectStore(storeName);
                  const getAll = store.getAll();

                  getAll.onsuccess = () => {
                    const data = getAll.result;
                    const count = data ? data.length : 0;

                    // Store data with samples
                    allData[dbInfo.name].objectStores[storeName] = {
                      count: count,
                      sample: data.slice(0, 5) // First 5 entries as sample
                    };

                    // Look for HTML content
                    if (data && data.length > 0) {
                      const htmlContent = data.filter((item) => {
                        const str = typeof item === 'string' ? item : JSON.stringify(item);
                        return str.includes('<') || str.includes('html');
                      });
                      if (htmlContent.length > 0) {
                        allData[dbInfo.name].objectStores[storeName].hasHTML = htmlContent.length;
                      }

                      // Look for note-like objects
                      const noteLike = data.filter((item) =>
                        item && typeof item === 'object' &&
                        (item.title || item.content || item.body || item.noteId)
                      );
                      if (noteLike.length > 0) {
                        allData[dbInfo.name].objectStores[storeName].hasNoteObjects = noteLike.length;
                      }
                    }

                    completed++;
                    if (completed === total) {
                      db.close();
                      resolve();
                    }
                  };

                  getAll.onerror = () => {
                    completed++;
                    if (completed === total) {
                      db.close();
                      resolve();
                    }
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

            allData[dbInfo.name].databaseInfo = {
              objectStoreNames: Array.from(dbInfo.objectStoreNames || []),
              extractedAt: new Date().toISOString()
            };
          }

          return allData;
        } catch (err) {
          return { error: err.message, stack: err.stack };
        }
      })()
    `;

    const result = await Runtime.evaluate({
      expression: dumpScript,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      console.error('✗ Error executing script:', result.exceptionDetails);
      throw new Error(result.exceptionDetails.exception?.description || 'Unknown error');
    }

    const data = result.result.value;

    if (data.error) {
      console.error('✗ Error in IndexedDB operation:', data.error);
      console.error('Stack:', data.stack);
      throw new Error(data.error);
    }

    // Save the results
    const outputDir = path.join(process.cwd(), 'nimbus-indexeddb-dump');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, 'indexeddb-scan.json');
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));

    console.log('✓ IndexedDB scan saved to:', outputFile);
    console.log('');

    // Analyze and report
    for (const [dbName, dbData] of Object.entries(data)) {
      console.log(`📊 ${dbName} (v${dbData.version})`);
      if (dbData.databaseInfo?.objectStoreNames) {
        console.log(`   Stores: ${dbData.databaseInfo.objectStoreNames.join(', ')}`);
      }

      for (const [storeName, storeData] of Object.entries(dbData.objectStores)) {
        console.log(`   • ${storeName}: ${storeData.count} entries`);
        if (storeData.hasHTML > 0) {
          console.log(`     → Contains HTML: ${storeData.hasHTML} entries`);
        }
        if (storeData.hasNoteObjects > 0) {
          console.log(`     → Contains note-like objects: ${storeData.hasNoteObjects} entries`);
        }
        if (storeData.sample && storeData.sample.length > 0) {
          const sample = storeData.sample[0];
          const preview = typeof sample === 'string'
            ? sample.substring(0, 80).replace(/\n/g, ' ')
            : JSON.stringify(sample).substring(0, 80);
          console.log(`     → Sample: ${preview}...`);
        }
      }
      console.log('');
    }

    console.log('Full data saved to:', outputFile);

  } catch (err) {
    if (err.message.includes('ECONNREFUSED')) {
      console.error('\n✗ Could not connect to Chrome DevTools Protocol.');
      console.error('\nTo enable remote debugging:');
      console.error('1. Close Nimbus Note if running');
      console.error('2. Start Nimbus Note with:');
      console.error('   "/Applications/Nimbus Note.app/Contents/MacOS/Nimbus Note" --remote-debugging-port=9222');
      console.error('3. Re-run this script\n');
    } else {
      console.error('✗ Error:', err.message);
    }
    throw err;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

dumpIndexedDB().catch(err => {
  console.error('✗ Fatal error:', err.message);
  process.exit(1);
});
