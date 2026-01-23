const { Level } = require('level');
const fs = require('fs');
const path = require('path');

async function extractLocalData() {
  const dbPath = path.join(process.env.HOME, 'Library/Application Support/nimbus-note-desktop/Local Storage/leveldb');
  const db = new Level(dbPath, { createIfMissing: false, valueEncoding: 'view' });

  const outputDir = path.join(process.cwd(), 'nimbus-local-data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Extracting Nimbus Note local data...');
  console.log(`Output directory: ${outputDir}\n`);

  // Find all keys starting with the domain (separator is \x00\x01)
  const prefix = '_https://sachajw.nimbusweb.me\x00\x01';
  const allData = {};

  for await (const [key, value] of db.iterator()) {
    const keyStr = Buffer.from(key).toString('utf-8');

    if (keyStr.startsWith(prefix)) {
      const shortKey = keyStr.substring(prefix.length);
      let valueStr = Buffer.from(value).toString('utf-8');

      // Strip the prefix byte (\x01 or \x00)
      if (valueStr.startsWith('\x01') || valueStr.startsWith('\x00')) {
        valueStr = valueStr.substring(1);
      }

      // Handle the weirdly encoded siqlsdb (null bytes between chars)
      if (shortKey === 'siqlsdb') {
        valueStr = valueStr.replace(/\x00/g, '');
      }

      // Try to parse as JSON
      try {
        allData[shortKey] = JSON.parse(valueStr);
      } catch (e) {
        // Not JSON, keep as string
        allData[shortKey] = valueStr;
      }
    }
  }

  await db.close();

  console.log(`Extracted ${Object.keys(allData).length} entries\n`);

  // Save all data
  fs.writeFileSync(
    path.join(outputDir, 'all-data.json'),
    JSON.stringify(allData, null, 2)
  );
  console.log('✓ Saved all-data.json');

  // Extract and count note IDs from folder data
  const foldersEntry = allData['nimbus-note-folders-foldersIdsByParentId'];
  if (foldersEntry) {
    const noteIds = new Set();
    const folderIds = Object.keys(foldersEntry);

    for (const folderId of folderIds) {
      const notes = foldersEntry[folderId];
      if (Array.isArray(notes)) {
        notes.forEach(id => noteIds.add(id));
      }
    }

    console.log(`  → Found ${folderIds.length} folders`);
    console.log(`  → Found ${noteIds.size} unique note IDs in folder mappings`);

    // Save note ID list
    fs.writeFileSync(
      path.join(outputDir, 'note-ids.json'),
      JSON.stringify([...noteIds], null, 2)
    );
    console.log('✓ Saved note-ids.json');
  }

  // Extract folder tree
  const treeEntry = allData['nimbus-note-tree-2quc3rctl5feowy1'];
  if (treeEntry) {
    fs.writeFileSync(
      path.join(outputDir, 'folder-tree.json'),
      JSON.stringify(treeEntry, null, 2)
    );
    console.log('✓ Saved folder-tree.json');
  }

  // Extract siqlsdb (likely cached notes)
  const siqlsEntry = allData['siqlsdb'];
  if (siqlsEntry && typeof siqlsEntry === 'object') {
    const keyCount = Object.keys(siqlsEntry).length;
    console.log(`  → siqlsdb contains ${keyCount} entries (likely cached notes/data)`);

    fs.writeFileSync(
      path.join(outputDir, 'siqlsdb.json'),
      JSON.stringify(siqlsEntry, null, 2)
    );
    console.log('✓ Saved siqlsdb.json');
  }

  console.log(`\nDone! Data extracted to: ${outputDir}`);
}

extractLocalData().catch(console.error);
