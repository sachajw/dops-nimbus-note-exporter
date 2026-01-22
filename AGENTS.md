# Agent Guidelines

## Commands

```bash
npm run build      # Compile TypeScript to dist/ using tsc
npm run start      # Run directly with ts-node (development mode)
```

No lint or test commands are currently configured. If you need to test, run the CLI directly with `npm run start`.

## Architecture

CLI tool that exports notes from Nimbus Note API. Entry point is `src/index.ts` which orchestrates the export flow through API modules.

### Directory Structure
- `src/index.ts` - CLI entry point, main orchestration logic
- `src/api/` - API layer with focused modules:
  - `auth.ts` - Authentication and user session
  - `teams.ts` - Organizations and workspaces
  - `folders.ts` - Folder hierarchy
  - `notes.ts` - Note metadata, tags, and download via WebSocket
  - `types.ts` - Shared TypeScript interfaces
  - `utils.ts` - HTTP request wrapper with cookie handling

## Code Style

### Imports
- Use named imports: `import { login } from "./api/auth"`
- Default imports for some packages: `import ADMZip from "adm-zip"`
- Relative paths use `./` for local modules
- Import order: stdlib modules, third-party, local modules (separated by blank lines)

### Types
- `export interface` for shared types that can be implemented
- `export type` for aliases/opaque types and unions
- Type assertions with `as`: `(await response.json()) as Note[]`
- Type casting with angle brackets: `<Organization[]>await response.json()`
- Generic functions for reusability: `function workWithSpinner<T>()`
- Optional properties with `?`: `path?: string`
- Strict TypeScript mode enabled in tsconfig.json
- Type definitions go in `src/api/types.ts` for shared interfaces
- Local type definitions in respective files (e.g., `LoginResponse` in auth.ts)

### Naming
- camelCase for functions/variables: `getNotes`, `downloadNotes`, `user`
- PascalCase for types/interfaces: `User`, `Note`, `Workspace`, `Folder`
- Descriptive names for clarity: `resolveParents`, `resolveWorkspace`, `workWithSpinner`
- Constants in camelCase: `pageSize`, `queue`, `spinner`
- Async function names start with verb: `login`, `getNotes`, `exportNote`
- Event handlers: descriptive names like `socket.on("socketConnect:userConnected", ...)`

### Error Handling
- Throw `new Error()` with descriptive messages
- Check HTTP responses: `if (!response.ok) throw new Error("Failed to...")`
- Validate API responses: `if (json.errorCode !== 0) throw new Error(...)`
- Throw early when validation fails: `if (!workspace) return;` or `if (!folder) break;`
- Error messages are concise but informative about what failed

### Concurrency & Async Patterns
- Use `p-queue` for concurrent operations (npm package)
- Concurrency levels: 16 for metadata operations, 8 for downloads
- Pattern: `const pqueue = new PQueue({ concurrency: N })`
- Add tasks: `await pqueue.addAll(items.map(item => async () => { ... }))`
- Use `async/await` throughout, avoid Promise chains
- Parallel operations with `Promise.all()`: `await Promise.all(workspaces.map(w => getFolders(user, w)))`
- Use `Set` for deduplication: `const extracted = new Set()`

### File I/O & Paths
- Use `path.join()` for cross-platform file path construction
- Use `fs/promises` for async file operations: `mkdir`, `rm`, `writeFile`
- Use `tempy` for temporary directories: `directory()`
- File existence check: `existsSync(path)` from `fs`
- Sanitize filenames: `sanitize(filename, { replacement: "-" })`
- Use `ADMZip` for zip file operations

### CLI & User Interaction
- Use `ora` for CLI spinners with status updates
- Pattern: `const spinner = ora(text).start(); spinner.succeed(successText);`
- Update spinner text during operations: `spinner.text = "Processing..."`
- Use `prompts` package for user input: `await prompts({ type: "text", name: "email", ... })`
- Use wrapper function `workWithSpinner<T>` to combine spinner with async operations

### HTTP & WebSocket
- Use `fetch-cookie` (makeFetchCookie) for cookie handling
- Custom `request()` function in `src/api/utils.ts` for all HTTP calls
- WebSocket via `socket.io-client` for export events
- Socket connection pattern: `io(\`wss://${domain}\`, { extraHeaders: { Cookie: ... } })`
- Listen to events: `socket.on("socketConnect:userConnected", resolve)`
- Headers include User-Agent, Accept, Content-Type, referer
- Credentials: "include" for cookie-based auth

### API Response Handling
- Parse JSON responses: `(await response.json())`
- Type cast responses: `as Note[]`, `as string[]`
- Paginated results: loop with offset/limit pattern
- Check response properties: `errorCode`, `body`, `id`
- Handle both success and error responses from API

### File Structure Patterns
- License header at top of each file (GPL-3.0-or-later)
- Export functions/types used by other modules
- Private helper functions (not exported) within files
- One concern per file (auth, teams, folders, notes, utils, types)
- Use `export` keyword for public APIs, keep internals private
- Order: imports, types, exported functions, private functions

### Code Organization
- Main flow in `index.ts` using `workWithSpinner` wrapper
- Each API module exports functions for specific domain
- Shared types in `types.ts` imported across modules
- Helper patterns like `resolveParents` and `resolveWorkspace` in index.ts
- Use of `for...of` loops instead of `forEach` for async operations

### WebSocket Event Flow
- Socket connects with extraHeaders containing session cookie
- Wait for `socketConnect:userConnected` event before proceeding
- Export notes via POST to `/api/workspaces/{id}/notes/{id}/export`
- Listen for `job:success` events containing download URLs
- Use Map to track pending exports with timeouts (60 seconds)
- Close socket when queue empties or timeout occurs

### Domain Constants
- Domain for auth requests: `nimbusweb.me`
- Domain for team/workspace requests: `teams.nimbusweb.me`
- User domain extracted from headers during authentication

### Download Patterns
- Export notes with `exportNote()` before downloading via WebSocket
- File downloads use `nodejs-file-downloader` with 60s timeout
- Existing files are removed before re-downloading
- Use `shouldBufferResponse: true` for downloader config

### Pagination Strategy
- Default page size is 500 items for notes and folders
- Loop while items.length < total count
- Use offset parameter based on current items length
- Break when all items are fetched

### Spinner Progress Updates
- Include counts in spinner text: `(${current}/${total})`
- Update frequently to show user progress
- Use descriptive action text: "Downloading notes", "Processing notes"
- Succeed with result summary when operation completes

### Note Processing
- Notes are exported in HTML format via WebSocket events
- Each note gets a metadata.json file with all properties
- Parent folders are resolved recursively into array of titles
- Attachments are filtered and added to note metadata