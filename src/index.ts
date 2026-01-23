#!/usr/bin/env node
/*
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
*/

import "dotenv/config";
import path from "path";
import { login } from "./api/auth";
import { downloadNotes, getNotes } from "./api/notes";
import {
  getWorkspaces,
  getOrganizations,
  getAttachments,
  Workspace,
} from "./api/teams";
import ADMZip from "adm-zip";
import { mkdir, rm, writeFile } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { fdir } from "fdir";
import prompts from "prompts";
import ora, { Ora } from "ora";
import { directory } from "tempy";
import { Folder, getFolders } from "./api/folders";
import { Note } from "./api/types";
import { Config } from "./api/config";
import { StatsTracker } from "./api/stats";
import archiver from "archiver";
import { pipeline } from "stream/promises";

async function main() {
  const outputPath = directory();
  const extractPath = directory();
  const finalOutputPath = Config.outputPath;
  const workspaceFilter = Config.workspace;
  const folderFilter = Config.folder;

  let email = Config.email;
  let password = Config.password;

  if (!email) {
    const response = await prompts({
      type: "text",
      name: "email",
      message: "Your Nimbus Note email:",
    });
    email = response.email;
  }

  if (!password) {
    const response = await prompts({
      type: "password",
      name: "password",
      message: "Your Nimbus Note password:",
    });
    password = response.password;
  }

  if (!email || !password) {
    throw new Error("Email and password are required. Set NIMBUS_EMAIL and NIMBUS_PASSWORD in .env or enter them when prompted.");
  }

  const credentials = { email, password };

  const user = await workWithSpinner(
    "Logging you in...",
    (u) => `Logged in as ${u.domain}`,
    () => login(credentials.email, credentials.password)
  );

  const organizations = await workWithSpinner(
    "Getting organizations...",
    (w) => `Found ${w.length} organizations`,
    () => getOrganizations(user)
  );

  const allWorkspaces = await workWithSpinner(
    "Getting workspaces...",
    (w) => `Found ${w.length} workspaces`,
    async () =>
      (
        await Promise.all(
          organizations.map((org) => getWorkspaces(user, org.globalId))
        )
      ).flat()
  );

  let workspaces = allWorkspaces;
  if (workspaceFilter) {
    workspaces = allWorkspaces.filter((w) => w.title === workspaceFilter);
    if (workspaces.length === 0) {
      throw new Error(`Workspace "${workspaceFilter}" not found. Available workspaces: ${allWorkspaces.map(w => w.title).join(", ")}`);
    }
  }

  const allFolders = await workWithSpinner(
    "Getting folders...",
    (f) => `Found ${f.length} folders across ${workspaces.length} workspaces`,
    async () =>
      (await Promise.all(workspaces.map((w) => getFolders(user, w)))).flat()
  );

  let folders = allFolders;
  let filteredFolderIds = new Set<string>();
  if (folderFilter) {
    const matchingFolders = allFolders.filter((f) => f.title === folderFilter);
    if (matchingFolders.length === 0) {
      throw new Error(
        `Folder "${folderFilter}" not found. Available folders: ${[
          ...new Set(allFolders.map((f) => f.title)),
        ].join(", ")}`
      );
    }
    // Include the matching folder and all its subfolders
    filteredFolderIds = new Set(matchingFolders.map((f) => f.globalId));
    // Find all subfolders (folders whose parentId is in the filtered set)
    let added = true;
    while (added) {
      added = false;
      for (const folder of allFolders) {
        if (
          !filteredFolderIds.has(folder.globalId) &&
          filteredFolderIds.has(folder.parentId)
        ) {
          filteredFolderIds.add(folder.globalId);
          added = true;
        }
      }
    }
    folders = allFolders.filter((f) => filteredFolderIds.has(f.globalId));
  }

  const attachments = await workWithSpinner(
    "Getting attachments...",
    (f) =>
      `Found ${f.length} attachments across ${workspaces.length} workspaces`,
    async () =>
      (
        await Promise.all(
          workspaces.map((w) => getAttachments(user, w.globalId))
        )
      ).flat()
  );

  const allNotes = await workWithSpinner<Note[]>(
    "Getting notes metadata...",
    (n) => `Found ${n.length} notes across ${workspaces.length} workspaces`,
    async (spinner) =>
      (
        await Promise.all(workspaces.map((w) => getNotes(user, w, spinner)))
      ).flat()
  );

  // Create stats tracker after we know the total note count
  let notes = allNotes;
  const stats = new StatsTracker(notes.length);

  if (folderFilter) {
    notes = allNotes.filter((n) => filteredFolderIds.has(n.parentId));
    if (notes.length === 0) {
      throw new Error(
        `No notes found in folder "${folderFilter}". Try a different folder or export all notes.`
      );
    }
    console.log(
      `Filtered to ${notes.length} notes in folder "${folderFilter}" (including subfolders)`
    );
  }

  if (notes.length === 0) throw new Error("0 notes found.");

  await workWithSpinner(
    "Downloading notes...",
    () => `${notes.length} downloaded.`,
    (spinner) => downloadNotes(user, notes, outputPath, spinner, stats)
  );

  await workWithSpinner(
    "Processing notes...",
    () => `Notes processed.`,
    async (spinner) => {
      const extracted = new Set();
      for (const note of notes) {
        if (!note.path || extracted.has(note.globalId)) continue;

        const zipPath = path.join(outputPath, note.path);
        const dir = path.join(extractPath, note.globalId);
        await mkdir(dir, { recursive: true });

        spinner.text = `Extracting ${zipPath} to ${dir}`;

        // WORKAROUND: Handle invalid filenames that adm-zip can't process
        let zip: ADMZip | undefined;
        try {
          zip = new ADMZip(zipPath);
        } catch (e: any) {
          console.error(`Warning: Skipping invalid zip file: ${note.path} (${e.message})`);
          continue;
        }

        await new Promise<void>((resolve, reject) =>
          zip!.extractAllToAsync(dir, true, true, (err?: Error) =>
            err ? reject(err) : resolve()
          )
        );

        spinner.text = `Writing ${note.title} to disk`;

        note.parents = resolveParents(note, folders);
        note.workspace = resolveWorkspace(note, workspaces);
        note.attachments = attachments.filter(
          (a) => a.noteGlobalId === note.globalId
        );

        await writeFile(path.join(dir, "metadata.json"), JSON.stringify(note));

        extracted.add(note.globalId);
      }
    }
  );

  // WORKAROUND: Use archiver with ZIP64 for large file counts (>65535)
  await workWithSpinner(
    "Creating final archive...",
    () => `Archive created.`,
    async (spinner) => {
      const output = createWriteStream(finalOutputPath);
      const archive = archiver("zip", {
        zlib: { level: 9 },
        // Enable ZIP64 to support >65535 files
        store: false,
      });

      return new Promise<void>((resolve, reject) => {
        output.on("close", () => {
          if (Config.debug) {
            console.error(`DEBUG: Archive created: ${archive.pointer()} bytes`);
          }
          resolve();
        });

        archive.on("error", (err) => {
          reject(err);
        });

        archive.on("progress", (progress) => {
          if (spinner) {
            spinner.text = `Archiving ${progress.entries.processed} files...`;
          }
        });

        archive.pipe(output);

        // Add all files from extractPath
        const files = new fdir()
          .withRelativePaths()
          .crawl(extractPath)
          .sync() as string[];

        for (const file of files) {
          const fullPath = path.join(extractPath, file);
          archive.file(fullPath, { name: file });
        }

        archive.finalize();
      });
    }
  );

  await rm(extractPath, { recursive: true, force: true });
  await rm(outputPath, { recursive: true, force: true });

  // Mark export complete and display summary
  stats.markComplete();

  // Display export statistics
  console.log(stats.getSummary());

  // Final success/failure message
  if (stats.isPerfect()) {
    ora().start().succeed("All notes exported successfully!");
  } else {
    const successRate = stats.getSuccessRate();
    if (successRate >= 90) {
      ora().start().succeed(`Export completed with ${successRate.toFixed(1)}% success rate`);
    } else if (successRate >= 50) {
      ora().start().warn(`Export completed with ${successRate.toFixed(1)}% success rate`);
    } else {
      ora().start().fail(`Export completed with ${successRate.toFixed(1)}% success rate`);
    }
  }
}
main();

function resolveParents(note: Note, folders: Folder[]) {
  const parents: string[] = [];
  if (note.parentId === "root") return [];
  let parent = folders.find((f) => f.globalId === note.parentId);
  if (!parent) return [];
  parents.push(parent.title);
  while (parent.parentId !== "root") {
    const folder = folders.find((f) => f.globalId === parent!.parentId);
    if (!folder) break;

    parent = folder;
    parents.push(folder.title);
  }

  return parents.reverse();
}

function resolveWorkspace(note: Note, workspaces: Workspace[]) {
  const workspace = workspaces.find((w) => w.globalId === note.workspaceId);
  if (!workspace) return;
  return workspace.title;
}

async function workWithSpinner<T>(
  text: string,
  successText: (result: T) => string,
  action: (spinner: Ora) => Promise<T>
): Promise<T> {
  const spinner = ora(text).start();
  const result = await action(spinner);
  spinner.succeed(successText(result));
  return result;
}
