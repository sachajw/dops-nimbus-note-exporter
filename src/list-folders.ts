#!/usr/bin/env node
import "dotenv/config";
import { login } from "./api/auth";
import { getOrganizations, getWorkspaces } from "./api/teams";
import { getFolders } from "./api/folders";

async function main() {
  const email = process.env.NIMBUS_EMAIL;
  const password = process.env.NIMBUS_PASSWORD;

  if (!email || !password) {
    throw new Error("NIMBUS_EMAIL and NIMBUS_PASSWORD must be set");
  }

  const user = await login(email, password);
  console.log(`Logged in as ${user.domain}`);

  const organizations = await getOrganizations(user);
  console.log(`Found ${organizations.length} organizations`);

  for (const org of organizations) {
    const workspaces = await getWorkspaces(user, org.globalId);

    for (const workspace of workspaces) {
      console.log(`\n=== Workspace: ${workspace.title} (${workspace.notesCount} notes, ${workspace.foldersCount} folders) ===`);

      const folders = await getFolders(user, workspace);
      const foldersWithNotes: Map<string, { title: string; noteCount: number; subfolders: string[] }> = new Map();

      // Get folder hierarchy
      const rootFolders = folders.filter(f => f.parentId === "root");

      for (const folder of rootFolders) {
        const subfolders = folders.filter(f => f.parentId === folder.globalId);
        foldersWithNotes.set(folder.globalId, {
          title: folder.title,
          noteCount: folder.cntNotes,
          subfolders: subfolders.map(s => s.title)
        });
      }

      // Sort by note count (descending)
      const sorted = Array.from(foldersWithNotes.entries())
        .sort((a, b) => b[1].noteCount - a[1].noteCount);

      console.log("\nTop folders by note count:");
      for (const [id, info] of sorted.slice(0, 50)) {
        console.log(`  ${info.title}: ${info.noteCount} notes${info.subfolders.length > 0 ? ` (${info.subfolders.length} subfolders)` : ""}`);
      }
    }
  }
}

main().catch(console.error);
