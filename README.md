# Nimbus Note Exporter

Nimbus Note recently removed the option (from their desktop clients) to bulk export your notes as HTML or PDF. This tool was created to bring that functionality back into the hands of the user.

**Notes**

- This tool is in no way endorsed or affiliated with Nimbus Note or any of their subsidiaries. If you come across any issue while using this tool, you should create a bug report in this repository — NOT ON THEIR SUPPORT CHANNEL.
- I am not sure this tool comes under "legal" use of Nimbus Note internal APIs so if there's a complaint, I will have to take this down.
- **Nimbus Export** only allows per page [exporting](https://thefusebase.com/guides/settings/how-to-export-notes-to-html-or-pdf/) 
- **This tool is strictly for personal use.**

## Features

This tool supports exporting of the following data types from Nimbus Note:

1. Notes (including HTML content & metadata)
2. Folders
3. Attachments
4. Tags
5. Data across unlimited workspaces
6. Data across unlimited organizations

### New Enhancements (v1.4.0+)

- **Rate Limiting**: Token bucket algorithm to prevent API overload
- **Retry Logic**: Exponential backoff for transient failures
- **Export Statistics**: Comprehensive summary of success/fail/timeout counts
- **Configurable Concurrency**: Tune parallel requests for your network
- **Job Failure Handling**: Proper handling of `job:failure` WebSocket events
- **Secure Credential Handling**: Credentials properly JSON-encoded

### New Enhancements (v1.5.0+)

- **Resume Mode**: Skip already-exported notes from a previous archive (`NIMBUS_RESUME_FROM`)
- **Retry-Only Mode**: Only retry specific failed notes from a JSON file (`NIMBUS_RETRY_ONLY`)
- **Failed Notes Tracking**: Automatically saves failed note IDs to JSON for incremental retry
- **URL Prediction**: Recovers timed-out exports by predicting download URLs from WebSocket events
- **Extended Wait Phase**: Configurable extended wait period for delayed WebSocket events
- **ZIP64 Support**: Handles archives with >65,535 files using the `archiver` library
- **Filename Truncation**: Automatically truncates long filenames to prevent filesystem errors
- **Wildcard Event Listener**: Catches all WebSocket events for better debugging and recovery

## Getting started

### Installation

First make sure you have Node (v16+) & npm installed then run:

```shell
npm i -g nimbus-note-exporter
```

### Usage

After installation, you should have the `nimbus-note-exporter` in your PATH. There is nothing complex to it, just run:

```shell
nimbus-note-exporter
```

And you'll be prompted for your email & password. Your credentials are required for login to work.

**Note:**

- You should not enter important credentials anywhere EXCEPT the official website. However, if you are required to do so then be CAREFUL and make sure your login details are not going anywhere you don't intend.
- After login, everything is automated. At the end you should have a `nimbus-export.zip` file in the directory where you ran the command, along with a comprehensive export summary.

### Environment Variables

You can configure the tool using environment variables or a `.env` file:

#### Basic Configuration

| Variable             | Description                                 | Default                |
| -------------------- | ------------------------------------------- | ---------------------- |
| `NIMBUS_EMAIL`       | Your Nimbus Note email                      | Prompts if not set     |
| `NIMBUS_PASSWORD`    | Your Nimbus Note password                   | Prompts if not set     |
| `NIMBUS_WORKSPACE`   | Filter to export specific workspace by name | Exports all workspaces |
| `NIMBUS_FOLDER`      | Filter to export specific folder by name    | Exports all folders    |
| `NIMBUS_OUTPUT_PATH` | Custom output path for the zip file         | `./nimbus-export.zip`  |

#### Performance Tuning

| Variable                   | Default | Description                                    |
| -------------------------- | ------- | ---------------------------------------------- |
| `NIMBUS_TAG_CONCURRENCY`   | 16      | Parallel tag fetch requests                    |
| `NIMBUS_EXPORT_CONCURRENCY` | 10      | Parallel export requests to WebSocket          |
| `NIMBUS_DOWNLOAD_CONCURRENCY` | 8    | Parallel file downloads                        |
| `NIMBUS_EXPORT_TIMEOUT`    | 300000  | Export timeout in milliseconds (5 minutes)     |
| `NIMBUS_DOWNLOAD_TIMEOUT`  | 60000   | Download timeout in milliseconds (60 seconds)   |

#### Retry Configuration

| Variable                   | Default | Description                                    |
| -------------------------- | ------- | ---------------------------------------------- |
| `NIMBUS_MAX_RETRIES`       | 3       | Maximum retry attempts for failed requests      |
| `NIMBUS_RETRY_INITIAL_DELAY` | 1000  | Initial retry delay in milliseconds            |
| `NIMBUS_RETRY_MAX_DELAY`   | 30000   | Maximum retry delay in milliseconds (30 seconds) |

#### Rate Limiting

| Variable                    | Default | Description                                    |
| --------------------------- | ------- | ---------------------------------------------- |
| `NIMBUS_RATE_LIMIT_RPS`     | 10      | Requests per second (token bucket refill rate)  |
| `NIMBUS_RATE_LIMIT_BURST`   | 20      | Burst size (max tokens available at once)       |

#### Resume & Retry

| Variable                    | Default              | Description                                              |
| --------------------------- | -------------------- | -------------------------------------------------------- |
| `NIMBUS_RESUME_FROM`        | -                    | Path to existing archive to skip already-exported notes  |
| `NIMBUS_RETRY_ONLY`         | -                    | Path to JSON file with note IDs to retry (skips others)  |
| `NIMBUS_FAILED_NOTES_FILE`  | `./failed-notes.json`| Path to save failed note IDs for later retry             |
| `NIMBUS_EXTENDED_WAIT`      | 600000               | Extended wait time (ms) for delayed WebSocket events     |
| `NIMBUS_ENABLE_URL_PREDICTION` | true              | Enable URL prediction recovery for timed-out exports     |

#### Debugging

| Variable         | Default | Description                                    |
| ---------------- | ------- | ---------------------------------------------- |
| `NIMBUS_DEBUG`   | false   | Enable verbose debug logging                   |

Example `.env` file:

```bash
# Copy the example file to create your own
cp .env.example .env

# Then edit .env with your credentials and preferences
```

See `.env.example` for all available options with descriptions.

### Export Statistics

After each export, you'll see a comprehensive summary:

```
============================================================
EXPORT SUMMARY
============================================================
Total notes:           150
Successful exports:    145
Failed exports:        3
Timed out exports:     2
Success rate:          96.7%
Duration:              3m 45s

Tag fetching:
  Successful:          145/150
  Failed:              5/150

Downloads:
  Successful:          145/145

Failed exports (5):
  - Note 1 (abc12345...)
    Reason: timeout
    Attempts: 4
  - Note 2 (def67890...)
    Reason: error - Rate limit exceeded
    Attempts: 3
============================================================
```

The tool will also indicate overall success:
- 🟢 **Green**: All notes exported successfully (100%)
- 🟡 **Yellow**: 90%+ success rate
- 🟠 **Orange**: 50-90% success rate
- 🔴 **Red**: <50% success rate

### Known Limitations

**Export API Reliability**: The Nimbus Note export API has known reliability issues that can affect exports of any size:

- The API accepts export requests and returns export IDs
- However, the WebSocket `job:success` events may never be sent, causing exports to timeout
- This can occur even with small batches (10-100 notes)
- The issue appears to be account-specific or domain-specific rather than strictly size-related
- The tool pauses when it hits the configured rate limit (10 requests/second). This is the      
  expected behavior to prevent overwhelming the Nimbus API.

**Possible Causes**:

- Account-level export quota exceeded
- API changes/breakage for specific Nimbus domains (e.g., `*.nimbusweb.me`)
- Nimbus Note has disabled or rate-limited bulk export functionality for certain accounts

**Workarounds**:

1. **Resume Mode (Recommended)**: Run multiple export passes, skipping already-exported notes

   ```shell
   # First export attempt
   NIMBUS_OUTPUT_PATH=./export-pass1.zip nimbus-note-exporter

   # Second pass - resume from first archive
   NIMBUS_RESUME_FROM=./export-pass1.zip NIMBUS_OUTPUT_PATH=./export-pass2.zip nimbus-note-exporter

   # Third pass - resume from second archive
   NIMBUS_RESUME_FROM=./export-pass2.zip NIMBUS_OUTPUT_PATH=./export-pass3.zip nimbus-note-exporter
   ```

2. **Retry-Only Mode**: After an export, retry only the failed notes

   ```shell
   # The tool automatically saves failed note IDs to ./failed-notes.json
   # Retry only those specific notes:
   NIMBUS_RETRY_ONLY=./failed-notes.json NIMBUS_OUTPUT_PATH=./retry.zip nimbus-note-exporter
   ```

3. **Extended Wait Time**: Increase wait time for delayed WebSocket events

   ```shell
   # Wait up to 15 minutes for delayed events (default: 10 minutes)
   NIMBUS_EXTENDED_WAIT=900000 nimbus-note-exporter
   ```

4. **Reduce concurrency**: Lower `NIMBUS_EXPORT_CONCURRENCY` to reduce server load

   ```shell
   NIMBUS_EXPORT_CONCURRENCY=3 nimbus-note-exporter
   ```

5. **Increase timeout**: Raise `NIMBUS_EXPORT_TIMEOUT` for slower connections

   ```shell
   NIMBUS_EXPORT_TIMEOUT=600000 nimbus-note-exporter
   ```

6. **Export by folder**: Use `NIMBUS_FOLDER` to export smaller subsets of notes

   ```shell
   NIMBUS_WORKSPACE="My Workspace" NIMBUS_FOLDER="Subfolder" nimbus-note-exporter
   ```

7. **Combine archives**: After multiple passes, combine all archives into one

   ```shell
   # Extract all archives to a combined directory
   mkdir combined && for z in export-pass*.zip; do unzip -q "$z" -d combined/; done

   # Create final combined archive
   cd combined && zip -rq ../nimbus-export-COMPLETE.zip . && cd ..
   ```

### Local Data Extraction (Advanced)

If the export API is not working for your account, you can extract note metadata directly from the Nimbus Note desktop client's local storage. This provides a list of all note IDs and folder structure, though **note content still requires the export API**.

**macOS Local Data Location:**

```shell
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

### Failed Notes Tracking

After each export, the tool automatically saves failed note IDs to a JSON file (default: `./failed-notes.json`):

```json
{
  "timestamp": "2026-01-24T00:10:46.859Z",
  "totalAttempted": 646,
  "successful": 639,
  "failed": 7,
  "noteIds": [
    "5Ps6WWyP4If5AZ3E",
    "6M4LBJPiGRG7jKYd",
    "GDHHkp6Uw5t2akrg"
  ]
}
```

Use this file with `NIMBUS_RETRY_ONLY` to retry only the failed notes:

```shell
NIMBUS_RETRY_ONLY=./failed-notes.json nimbus-note-exporter
```

### Unrecoverable Notes

Some notes may fail with server-side errors that cannot be resolved by retrying:

| Error | Meaning |
|-------|---------|
| `TypeError: _this2.getPreviews(...).then is not a function` | Note has corrupted preview data |
| `ReferenceError: editorJsonpCallbackRegistry is not defined` | Note uses unsupported editor features |

These errors occur inside Nimbus's server-side export code. The only solution is to contact Nimbus support with the specific note IDs.

**Confirmed Unrecoverable Notes (sachajw.nimbusweb.me):**

| Note ID | Error |
|---------|-------|
| `GDHHkp6Uw5t2akrg` | `ReferenceError: editorJsonpCallbackRegistry is not defined` |
| `6M4LBJPiGRG7jKYd` | `ReferenceError: editorJsonpCallbackRegistry is not defined` |
| `YE1QnqWZEUYDEsRn` | `ReferenceError: editorJsonpCallbackRegistry is not defined` |
| `OmDd6llVbJJe5GOX` | `ReferenceError: editorJsonpCallbackRegistry is not defined` |
| `5Ps6WWyP4If5AZ3E` | `TypeError: _this2.getPreviews(...).then is not a function` |
| `bCkgPmpJdYIq3EWy` | `TypeError: _this2.getPreviews(...).then is not a function` |

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

```plaintext
<note_id>/
  ├── note.html
  ├── metadata.json
  └── assets/
```

### Nimbus Workspaces

TheVestedLeopard
Default
Members 1
Folders 73
Pages 263
Created 02/25/2023

Platform Engineering
Members 1
Folders 4582
Pages 10000
Created 04/06/2023

### Example

**Initial Export:**

```
┌───────────────┬────────────────────────────────────────────┐
│     Step      │                   Result                   │
├───────────────┼────────────────────────────────────────────┤
│ Login         │ ✅ sachajw.nimbusweb.me                    │
├───────────────┼────────────────────────────────────────────┤
│ Organizations │ 1                                          │
├───────────────┼────────────────────────────────────────────┤
│ Workspaces    │ Filtered to "Platform Engineering" (1)     │
├───────────────┼────────────────────────────────────────────┤
│ Folders       │ 4,582                                      │
├───────────────┼────────────────────────────────────────────┤
│ Attachments   │ 59,735                                     │
├───────────────┼────────────────────────────────────────────┤
│ Notes         │ 10,000 (in Platform Engineering workspace) │
├───────────────┼────────────────────────────────────────────┤
│ WebSocket     │ ✅ Connected                               │
└───────────────┴────────────────────────────────────────────┘
```

**Multi-Pass Export Results:**

| Pass | Archive | Size | Notes Exported | Cumulative |
|------|---------|------|----------------|------------|
| 1 | nimbus-export-pe.zip | 3.0 GB | 2,625 | 2,625 |
| 2 | nimbus-export-retry.zip | 4.1 GB | 3,381 | 6,006 |
| 3 | nimbus-export-retry2.zip | 3.9 GB | 3,348 | 9,354 |
| 4 | nimbus-export-retry3.zip | 724 MB | 639 | 9,993 |
| 5 | nimbus-export-final.zip | 892 KB | 1 | 9,994 |
| **Combined** | **nimbus-export-COMPLETE.zip** | **12 GB** | **9,994** | **99.94%** |

### Test Results Summary

Testing on an affected account (`sachajw.nimbusweb.me`) with 10,000 notes:

| Method                      | Notes Attempted | Result                                      |
| --------------------------- | --------------- | ------------------------------------------- |
| Initial Bulk Export         | 10,000          | 2,625 exported (26.3%) - many timeouts      |
| Retry Pass 1 (resume mode)  | 7,375           | 3,381 additional (cumulative: 6,006)        |
| Retry Pass 2 (resume mode)  | 3,994           | 3,348 additional (cumulative: 9,354)        |
| Retry Pass 3 (retry-only)   | 646             | 639 additional (cumulative: 9,993)          |
| Final Retry (7 notes)       | 7               | 1 additional (cumulative: 9,994)            |
| **Final Result**            | **10,000**      | **9,994 exported (99.94% success rate)**    |

**Success Story**: Using the resume mode and retry-only features, we achieved a **99.94% success rate** on an account where the initial export only captured 26.3% of notes. The remaining 6 notes have server-side bugs in Nimbus's export code (JavaScript errors like `TypeError` and `ReferenceError`).
**Conclusion**: While the Nimbus export API is unreliable (only ~10-30% of exports succeed on first attempt), the incremental retry approach can recover nearly all notes through multiple passes.

### API Behavior Details

This tool interacts with several Nimbus Note internal APIs. Understanding these can help diagnose issues:

**1. Authentication Flow**

- `POST /auth/api/auth` - Returns `sessionId` and user's `domain` (e.g., `sachajw.nimbusweb.me`)
- All subsequent requests include the session cookie
- **Enhanced**: Credentials are now properly JSON-encoded for security

**2. Metadata Fetching** (Works Reliably)

- `GET /api/organizations` - Fetches organizations
- `GET /api/workspaces/{orgId}` - Fetches workspaces
- `GET /api/workspaces/{workspaceId}/notes?filter={"type":"folder"}` - Fetches folders
- `GET /api/workspaces/{workspaceId}/notes` - Fetches note metadata with tags
- **Enhanced**: All requests now support rate limiting and automatic retry

**3. Export Request** (Accepts but May Fail)

- `POST /api/workspaces/{workspaceId}/notes/{noteId}/export` - Submits export request
- Request body: `{ format: "html", ... }`
- Response: `{ id: "..." }` - **This always succeeds**
- **Enhanced**: Automatic retry on rate limits and transient errors

**4. Export Completion** (Fails for Some Accounts)

- Uses WebSocket connection (`socket.io-client`) to listen for events
- Expected events: `job:success` and `job:failure`
- **Enhanced**: Now handles both success and failure events properly
- **Failure mode**: The export job is queued on the server, but events are never sent
- The tool waits up to `NIMBUS_EXPORT_TIMEOUT` (default 5 minutes) before timing out

**5. Download** (Works When Export Succeeds)

- Downloads from the URL provided in `job:success` event
- Each note is extracted, enriched with `metadata.json`, and re-packaged
- **Enhanced**: Failed downloads are tracked in export statistics

**What This Means**:

- The filtering logic (folder/workspace) works correctly - the tool successfully identifies which notes to export
- The API properly accepts export requests
- Rate limiting prevents overwhelming the Nimbus servers
- Retry logic handles transient network issues
- The failure occurs server-side when Nimbus processes the export queue and should emit completion events
- This suggests an account-specific limitation or server-side issue, not a bug in this tool
- **However**, using the resume mode and retry-only features, nearly all notes can be recovered through multiple passes

**Recovery Strategy**:

The Nimbus API is unreliable - on initial export, only ~10-30% of notes may succeed. However, running multiple retry passes consistently recovers more notes:

1. **Pass 1**: ~25-30% success rate
2. **Pass 2**: Additional ~30-35% recovered
3. **Pass 3**: Additional ~30-35% recovered
4. **Pass 4+**: Diminishing returns, but can recover remaining stragglers

After 4-5 passes, expect **99%+ recovery rate**. The remaining ~0.1% are typically notes with server-side bugs in Nimbus's export code (JavaScript errors in their backend)

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

```plaintext
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
