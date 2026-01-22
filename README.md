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

**Large Workspace Exports**: The Nimbus Note export API has known limitations when exporting very large workspaces (10,000+ notes):

- The API accepts export requests and returns export IDs
- However, for large workspaces, the WebSocket `job:success` events are never sent
- All exports eventually timeout (default 5 minutes per export)

**Workarounds**:

1. **Export by folder**: Use `NIMBUS_FOLDER` to export smaller subsets of notes
   ```
   NIMBUS_WORKSPACE="My Workspace" NIMBUS_FOLDER="Subfolder" nimbus-note-exporter
   ```

2. **Export smaller workspaces**: If you have multiple workspaces, export them individually using `NIMBUS_WORKSPACE`

3. **Wait for API fixes**: The internal API behavior may change in the future; consider filing a support request with Nimbus Note for bulk export functionality

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
