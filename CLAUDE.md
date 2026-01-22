# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build      # Compile TypeScript to dist/
npm run start      # Run directly with ts-node (development)
```

## Architecture

This is a CLI tool that exports notes from Nimbus Note via their internal API. It's published to npm as `nimbus-note-exporter`.

### Entry Point
- `src/index.ts` - CLI entry point, orchestrates the export flow: login → fetch orgs/workspaces/folders/attachments/notes → download → process → zip

### API Layer (`src/api/`)
- `auth.ts` - Login authentication, returns User with sessionId and domain
- `teams.ts` - Fetches organizations, workspaces, and attachments
- `folders.ts` - Fetches folder hierarchy within workspaces
- `notes.ts` - Fetches note metadata, tags, and handles bulk export/download via WebSocket
- `types.ts` - Shared TypeScript interfaces (Note, Attachment)
- `utils.ts` - HTTP request wrapper with cookie handling

### Key Implementation Details
- Uses WebSocket (`socket.io-client`) to receive export completion events from Nimbus servers
- Concurrent API calls managed via `p-queue` (16 concurrency for metadata, 8 for downloads)
- Notes are exported as HTML zips, extracted, enriched with metadata.json, then re-zipped
- Parent folder path resolution reconstructs folder hierarchy from flat folder list
- All requests use `fetch-cookie` for session persistence
