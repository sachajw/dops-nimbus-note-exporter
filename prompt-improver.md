As an expert software engineer with more than 20 years of experience you are tasked with finding a solution to extract
all the data from Nimbus Note, a popular note-taking application, in a structured and efficient manner. 
Your goal is to create a software solution that exports all notes, attachments, and metadata from Nimbus Note accounts
for the platform engineering workspace at https://sachajw.nimbusweb.me/. There are multiple avenues to exploit such as the Nimbus API directly
or reverse engineering the Nimbus Note desktop or web clients.

# Nimbus Note Exporter

> **Legal Notice:** This tool uses unofficial Nimbus Note APIs through reverse engineering. It is not endorsed by or affiliated with Nimbus Note. Use at your own risk. If complaints arise, this project may be taken down.

## TL;DR

```bash
# Install
npm i -g nimbus-note-exporter

# Run (will prompt for email/password)
nimbus-note-exporter

# Output: nimbus-export.zip in current directory
```

## Quick Start

**Requirements:** Node.js v16+

**Step 1:** Install the tool
```bash
npm i -g nimbus-note-exporter
```

**Step 2:** Run the exporter
```bash
nimbus-note-exporter
```

**Step 3:** Enter your Nimbus Note credentials when prompted

That's it! Your notes will be exported to `nimbus-export.zip`.

## What Gets Exported

| Data Type | Included |
|-----------|----------|
| Notes (HTML content) | ✓ |
| Note metadata | ✓ |
| Folders | ✓ |
| Attachments | ✓ |
| Tags | ✓ |
| All workspaces | ✓ |
| All organizations | ✓ |

## Configuration Options

Set these as environment variables or in a `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `NIMBUS_EMAIL` | Your Nimbus Note email | Prompts if not set |
| `NIMBUS_PASSWORD` | Your Nimbus Note password | Prompts if not set |
| `NIMBUS_WORKSPACE` | Export only this workspace | All workspaces |
| `NIMBUS_FOLDER` | Export only this folder | All folders |
| `NIMBUS_OUTPUT_PATH` | Custom output path | `./nimbus-export.zip` |

**Example `.env` file:**
```
NIMBUS_EMAIL=your-email@example.com
NIMBUS_PASSWORD=your-password
NIMBUS_WORKSPACE=Platform Engineering
NIMBUS_OUTPUT_PATH=./my-export.zip
```

## Output Structure

```
nimbus-export.zip
├── <note_id>/
│   ├── note.html      # Note content
│   ├── metadata.json  # Timestamps, tags, folder path, etc.
│   └── assets/        # Fonts, images, attachments
├── <note_id>/
│   └── ...
```

## Export Process Flow

```
┌─────────────────┐
│  Login          │ → Authenticate with Nimbus servers
└────────┬────────┘
         ▼
┌─────────────────┐
│  Fetch Metadata │ → Get orgs, workspaces, folders, notes list
└────────┬────────┘   (This step is reliable)
         ▼
┌─────────────────┐
│  Request Export │ → Submit bulk export request to API
└────────┬────────┘   (Request accepted, but...)
         ▼
┌─────────────────┐
│  Wait for Event │ → Listen for WebSocket 'job:success'
└────────┬────────┘   ⚠️ May timeout for some accounts
         ▼
┌─────────────────┐
│  Download ZIP   │ → Fetch generated export
└────────┬────────┘
         ▼
┌─────────────────┐
│  Process & Save │ → Add metadata, create final zip
└─────────────────┘
```

## Converting to Markdown

After exporting, use [Jimmy](https://github.com/marph91/jimmy) to convert to Markdown for Obsidian, Joplin, or other editors:

```bash
# Download Jimmy from: https://github.com/marph91/jimmy/releases
jimmy-darwin-arm64 cli /path/to/nimbus-export.zip
```

## Troubleshooting

**Exports timing out?** See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for:
- Known API reliability issues affecting some accounts
- Workarounds (export by folder, smaller workspaces)
- Local data extraction options
- Detailed API behavior documentation

## Metadata Reference

The `metadata.json` file includes:

```ts
interface Metadata {
  globalId: string;
  title: string;
  path: string;           // Full folder path
  parents: string[];      // Parent folder chain
  workspace: string;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
  dateAdded?: number;
  dateUpdated?: number;
  favorite: boolean;
  shared: boolean;
  isEncrypted: boolean;
  isCompleted: boolean;
  color: string;
  emoji: string;
  // ... additional fields
}
```

## Why This Tool Exists

Nimbus Note removed bulk export options from their desktop clients. 
This tool restores that functionality by using the same internal APIs that their web clients use.

**Expect this tool to break at any time** if Nimbus changes their API.

## Privacy

This tool only communicates with official Nimbus Note servers (`*.nimbusweb.me`). No data is sent elsewhere. Review the source code if you have concerns.
