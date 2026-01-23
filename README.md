# Nimbus Note Exporter

Nimbus Note recently removed the option (from their desktop clients) to bulk export your notes as HTML or PDF. This tool was created to bring that functionality back into the hands of the user.

> **Note:** This tool is in no way endorsed or affiliated with Nimbus Note or any of their subsidiaries. If you come across any issue while using this tool, you should create a bug report in this repository — NOT ON THEIR SUPPORT CHANNEL.

> **Note 2:** I am not sure this tool comes under "legal" use of Nimbus Note internal APIs so if there's a complaint, I will have to take this down.

> **This tool is strictly for personal use.**

## Features

This tool supports exporting of the following data types from Nimbus Note:

1. Notes (including HTML content & metadata)
2. Folders
3. Attachments
4. Tags
5. Data across unlimited workspaces
6. Data across unlimited organizations

## Getting started

### Installation

First make sure you have Node (v16+) & npm installed then run:

```
npm i -g nimbus-note-exporter
```

### Usage

After installation, you should have the `nimbus-note-exporter` in your PATH. There is nothing complex to it, just run:

```
nimbus-note-exporter
```

And you'll be prompted for your email & password. Your credentials are required for login to work.

> **Note:** You should not enter important credentials anywhere EXCEPT the official website. However, if you are required to do so then be CAREFUL and make sure your login details are not going anywhere you don't want/intend.

After login, everything is automated. At the end you should have a `nimbus-export.zip` file in the directory where you ran the command.

### Environment Variables

You can configure the tool using environment variables or a `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `NIMBUS_EMAIL` | Your Nimbus Note email | Prompts if not set |
| `NIMBUS_PASSWORD` | Your Nimbus Note password | Prompts if not set |
| `NIMBUS_WORKSPACE` | Filter to export specific workspace by name | Exports all workspaces |
| `NIMBUS_FOLDER` | Filter to export specific folder by name | Exports all folders |
| `NIMBUS_OUTPUT_PATH` | Custom output path for the zip file | `./nimbus-export.zip` |

Example `.env` file:
```
NIMBUS_EMAIL=your-email@example.com
NIMBUS_PASSWORD=your-password
NIMBUS_WORKSPACE=Platform Engineering
NIMBUS_OUTPUT_PATH=./my-export.zip
```

### Known Limitations

**Export API Reliability**: The Nimbus Note export API has known reliability issues that can affect exports of any size:

- The API accepts export requests and returns export IDs
- However, the WebSocket `job:success` events may never be sent, causing exports to timeout
- This can occur even with small batches (10-100 notes)
- The issue appears to be account-specific or domain-specific rather than strictly size-related

**Possible Causes**:

- Account-level export quota exceeded
- API changes/breakage for specific Nimbus domains (e.g., `*.nimbusweb.me`)
- Nimbus Note has disabled or rate-limited bulk export functionality for certain accounts

**Workarounds**:

1. **Export by folder**: Use `NIMBUS_FOLDER` to export smaller subsets of notes
   ```
   NIMBUS_WORKSPACE="My Workspace" NIMBUS_FOLDER="Subfolder" nimbus-note-exporter
   ```

2. **Export smaller workspaces**: If you have multiple workspaces, export them individually using `NIMBUS_WORKSPACE`

3. **Manual export via web client**: Check if the Nimbus Note web interface has export options available

4. **Contact Nimbus Note support**: Request bulk export or ask about API access for your account

5. **Try a different account**: If you have multiple Nimbus accounts, test if exports work on another

### Local Data Extraction (Advanced)

If the export API is not working for your account, you can extract note metadata directly from the Nimbus Note desktop client's local storage. This provides a list of all note IDs and folder structure, though **note content still requires the export API**.

**macOS Local Data Location:**
```
~/Library/Application Support/nimbus-note-desktop/Local Storage/leveldb/
```

**Extraction Script:**

A proof-of-concept extraction script is included that can:
- Extract note IDs from Local Storage (4,580+ notes found in testing)
- Extract folder hierarchy and mappings
- Provide workspace information

To use:
```bash
# 1. Close Nimbus Note desktop client first (to unlock databases)
# 2. Install dependencies
npm install level

# 3. Run the extraction script
node extract-local-data.js
```

This creates a `nimbus-local-data/` directory with:
- `all-data.json` - All extracted Local Storage data
- `note-ids.json` - List of all note IDs (4,580+ found in testing)
- `folder-tree.json` - Folder hierarchy structure
- `folders.json` - Folder-to-note mappings

**Important Notes:**
- This only extracts **metadata** (note IDs, folder structure), not note content
- Note content still requires the export API which may also fail
- Individual note export was tested and has the same timeout issues as bulk export
- A LevelDB viewer will not help with reading note content (it's stored in Chromium's proprietary IndexedDB format)

**IndexedDB Investigation:**

Additional investigation was performed to determine if note content could be extracted from IndexedDB (the browser's database for structured data):

```bash
# Scripts used for investigation
# 1. inspect-indexeddb-puppeteer.js - Scans IndexedDB databases
# 2. inspect-all-targets.js - Checks all CDP targets
# 3. navigate-to-note.js - Tests if navigating to notes triggers caching
```

**Findings:**
- Nimbus Note uses IndexedDB (`FusebaseIDB`) with a `pages` store
- Only **1 entry** was found in IndexedDB (a serialized cache dump, not note content)
- Navigating to specific note pages does **NOT** trigger local caching of note content
- Note content is fetched from the server on-demand and NOT stored locally

**Conclusion:** Note content cannot be extracted locally from the Nimbus Note desktop client. The application architecture requires fetching content from Nimbus servers via the API, and the export API failure for some accounts is a server-side limitation that cannot be bypassed through local data extraction.

### Post-Export Conversion: Jimmy

If you successfully export your notes, you can convert them to Markdown using [Jimmy](https://github.com/marph91/jimmy), a universal note converter that supports Nimbus Note:

```bash
# Install Jimmy
# Download from: https://github.com/marph91/jimmy/releases

# Convert exported Nimbus notes to Markdown
jimmy-darwin-arm64 cli /path/to/nimbus-export.zip

# The output is compatible with:
# - Obsidian
# - Joplin
# - Any Markdown editor
```

Jimmy expects the same ZIP structure that this tool produces:
```
<note_id>/
  ├── note.html
  ├── metadata.json
  └── assets/
```

### Test Results Summary

Testing on an affected account (`sachajw.nimbusweb.me`):

| Method | Notes Attempted | Result |
|--------|-----------------|--------|
| Bulk Export (10 notes) | 10 | Timeout - no `job:success` events |
| Bulk Export (all notes) | 4,580 | Timeout - no `job:success` events |
| Individual Export (5 notes) | 5 | Timeout - no `job:success` events |
| Local Data Extraction | N/A | ✓ Successfully extracted 4,580 note IDs |

**Conclusion**: The export API failure affects both bulk and individual exports for some accounts. The issue is server-side (Nimbus never sends completion events), not a bug in this tool.

### API Behavior Details

This tool interacts with several Nimbus Note internal APIs. Understanding these can help diagnose issues:

**1. Authentication Flow**
- `POST /api/auth/login` - Returns `sessionId` and user's `domain` (e.g., `sachajw.nimbusweb.me`)
- All subsequent requests include the session cookie

**2. Metadata Fetching** (Works Reliably)
- `GET /api/teams/getall` - Fetches organizations
- `GET /api/workspaces/list` - Fetches workspaces
- `GET /api/folders/list` - Fetches folder hierarchy
- `GET /api/notes/list` - Fetches note metadata with tags

**3. Export Request** (Accepts but May Fail)
- `POST /api/bulk/export/add` - Submits bulk export request
- Request body: `{ "noteGlobalIds": ["id1", "id2", ...], "format": "html" }`
- Response: `{ "exportId": "..." }` - **This always succeeds**

**4. Export Completion** (Fails for Some Accounts)
- Uses WebSocket connection (`socket.io-client`) to listen for events
- Expected event: `job:success` with `{ "exportId": "..." }`
- **Failure mode**: The export job is queued on the server, but the success event is never sent
- The tool waits up to 5 minutes (configurable) before timing out

**5. Download** (Works When Export Succeeds)
- `GET /api/bulk/export/download?exportId=...` - Downloads the generated ZIP file
- Each note is extracted, enriched with `metadata.json`, and re-packaged

**What This Means**:
- The filtering logic (folder/workspace) works correctly - the tool successfully identifies which notes to export
- The API properly accepts export requests
- The failure occurs server-side when Nimbus processes the export queue and should emit the completion event
- This suggests an account-specific limitation or server-side issue, not a bug in this tool

## How it works?

This tool was created by reverse engineering Nimbus Note internal API used by their web clients. Expect this to break anytime.

## The output

This tool exports all your data from Nimbus Note in "raw" form as a .zip file with the following structure:

```
- <note_id>
    - assets
    - metadata.json
    - note.html
- <note_id>
    - assets
    - ...
```

### metadata.json

The `metadata.json` file contains information such as timestamps, tags, folders, & other metadata. Here's a complete list:

```ts
interface Metadata {
  globalId: string;
  parentId: string;
  rootParentId: string;
  createdAt?: number;
  dateAdded?: number;
  dateUpdated?: number;
  updatedAt?: number;
  type: string;
  role: string;
  title: string;
  url: string;
  locationLat: number;
  locationLng: number;
  shared: boolean;
  favorite: boolean;
  lastChangeBy: number;
  cntNotes: number;
  size: number;
  editnote: boolean;
  isEncrypted: boolean;
  color: string;
  isCompleted: boolean;
  workspaceId: string;
  isImported: boolean;
  isFullwidth: boolean;
  userId: number;
  isReady: boolean;
  outliner: boolean;
  emoji: string;
  is_portal_share: boolean;
  tags: string[];
  path: string;
  parents: string[];
  workspace: string;
}
```

### note.html

The `note.html` file is the raw content in HTML format.

### assets/

The `assets/` directory contains stuff such as fonts and attachments.

## Privacy policy

This script only connects to the official Nimbus Note servers and does not send or receive any other information to/from any other endpoint. The source code can be examined in case of any doubts.

## License

```
This file is part of the nimbus-note-exporter project

Copyright (C) 2023 Abdullah Atta

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
```
