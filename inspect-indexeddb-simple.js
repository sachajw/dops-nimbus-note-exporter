#!/usr/bin/env node
/*
Simple IndexedDB scanner - just enumerate databases and object stores
*/

const fs = require('fs');
const path = require('path');
const CDP = require('chrome-remote-interface');

const CDP_PORT = 9222;

async function scanIndexedDB() {
  console.log('Scanning IndexedDB via CDP...\n');

  let client;

  try {
    // Connect to CDP and get the list of targets
    const targets = await CDP.List({ port: CDP_PORT });

    // Find the Nimbus web app target
    const nimbusTarget = targets.find(t =>
      t.url.includes('nimbusweb.me') ||
      t.title.includes('Nimbus')
    );

    if (!nimbusTarget) {
      console.error('✗ Could not find Nimbus Note target');
      process.exit(1);
    }

    console.log(`✓ Found target: ${nimbusTarget.title}`);
    console.log(`  URL: ${nimbusTarget.url}\n`);

    // Connect to the target
    client = await CDP({ target: nimbusTarget, port: CDP_PORT });
    const { Runtime } = client;
    await Runtime.enable();

    // First just enumerate databases
    console.log('Step 1: Enumerating IndexedDB databases...\n');
    const enumResult = await Runtime.evaluate({
      expression: 'indexedDB.databases()',
      returnByValue: true,
      awaitPromise: true,
    });

    if (enumResult.exceptionDetails) {
      console.error('✗ Error:', enumResult.exceptionDetails);
      throw new Error(enumResult.exceptionDetails.exception?.description || 'Unknown error');
    }

    const databases = enumResult.result.value;
    console.log(`Found ${databases.length} databases:`);
    databases.forEach((db, i) => {
      console.log(`  ${i + 1}. ${db.name} (version ${db.version})`);
    });
    console.log('');

    // Now for each database, get the count of entries in each store
    console.log('Step 2: Scanning object stores...\n');
    const scanResults = [];

    for (const db of databases) {
      console.log(`Scanning: ${db.name}...`);

      const scanScript = `
        (async () => {
          return new Promise((resolve, reject) => {
            const request = indexedDB.open('${db.name}', ${db.version});
            request.onsuccess = () => {
              const db = request.result;
              const stores = {};

              let completed = 0;
              const total = db.objectStoreNames.length;

              if (total === 0) {
                db.close();
                resolve({ stores: {} });
                return;
              }

              db.objectStoreNames.forEach((storeName) => {
                const store = db.transaction(storeName, 'readonly').objectStore(storeName);
                const countReq = store.count();

                countReq.onsuccess = () => {
                  stores[storeName] = { count: countReq.result };
                  completed++;
                  if (completed === total) {
                    db.close();
                    resolve({ stores });
                  }
                };

                countReq.onerror = () => {
                  stores[storeName] = { count: -1, error: 'count failed' };
                  completed++;
                  if (completed === total) {
                    db.close();
                    resolve({ stores });
                  }
                };
              });
            };
            request.onerror = () => reject(request.error);
          });
        })()
      `;

      const result = await Runtime.evaluate({
        expression: scanScript,
        returnByValue: true,
        awaitPromise: true,
        timeout: 30000,
      });

      if (result.exceptionDetails) {
        console.error(`  ✗ Error: ${result.exceptionDetails.exception?.description}`);
        scanResults.push({ name: db.name, version: db.version, error: 'Scan failed' });
        continue;
      }

      const scanData = result.result.value;
      scanResults.push({
        name: db.name,
        version: db.version,
        stores: scanData.stores
      });

      for (const [storeName, storeData] of Object.entries(scanData.stores)) {
        console.log(`  • ${storeName}: ${storeData.count} entries`);
      }
      console.log('');
    }

    // Save results
    const outputDir = path.join(process.cwd(), 'nimbus-indexeddb-dump');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, 'indexeddb-scan.json');
    fs.writeFileSync(outputFile, JSON.stringify(scanResults, null, 2));

    console.log(`✓ Results saved to: ${outputFile}`);

  } catch (err) {
    if (err.message.includes('ECONNREFUSED')) {
      console.error('\n✗ Could not connect to Chrome DevTools Protocol.');
      console.error('\nMake sure Nimbus Note is running with: --remote-debugging-port=9222');
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

scanIndexedDB().catch(err => {
  console.error('✗ Fatal error:', err.message);
  process.exit(1);
});
