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

import { io } from "socket.io-client";
import { User } from "./auth";
import { request } from "./utils";
import { existsSync } from "fs";
import { mkdir, rm } from "fs/promises";
import sanitize from "sanitize-filename";
import path from "path";
import Downloader from "nodejs-file-downloader";
import PQueue from "p-queue";
import { Ora } from "ora";
import { Workspace } from "./teams";
import { Note } from "./types";
import { Config } from "./config";
import { retryOrThrow } from "./retry";
import { StatsTracker, FailureReason } from "./stats";

// WebSocket event types
interface JobSuccessEvent {
  message: {
    uuid: string;
    fileName: string;
    fileUrl: string;
    taskData?: {
      noteGlobalId: string;
    };
  };
}

interface JobFailureEvent {
  message: {
    uuid: string;
    error?: string;
    taskData?: {
      noteGlobalId: string;
    };
  };
}

interface ExportRequest {
  note: Note;
  exportId?: string;
  attempts: number;
}

export async function getNotes(
  user: User,
  workspace: Workspace,
  spinner?: Ora,
  stats?: StatsTracker
) {
  const pageSize = 500;
  const notes: Note[] = [];

  while (notes.length < workspace.notesCount) {
    const response = await request({
      user,
      endpoint: `/api/workspaces/${
        workspace.globalId
      }/notes?range=${JSON.stringify({
        limit: pageSize,
        offset: notes.length,
      })}`,
      method: "GET",
    });
    notes.push(...((await response.json()) as Note[]));

    if (spinner)
      spinner.text = `Getting notes metadata (${notes.length}/${workspace.notesCount})`;
  }

  if (spinner) spinner.text = `Getting tags for notes...`;

  const pqueue = new PQueue({ concurrency: Config.tagConcurrency });
  await pqueue.addAll(
    notes.map((note) => {
      return async () => {
        const tags = await getNoteTags(user, note, stats);
        note.tags = tags;
      };
    })
  );

  return notes;
}

async function getNoteTags(user: User, note: Note, stats?: StatsTracker): Promise<string[]> {
  try {
    const response = await request({
      user,
      endpoint: `/api/workspaces/${note.workspaceId}/notes/${note.globalId}/tags`,
      method: "GET",
    });
    const tags = (await response.json()) as string[];
    if (stats) stats.recordTagFetchSuccess();
    return tags;
  } catch (e) {
    if (stats) stats.recordTagFetchFailed();
    // Silently skip tags on error (rate limiting, etc.)
    return [];
  }
}

export async function exportNote(
  user: User,
  note: Note,
  format: "html" | "pdf",
  stats?: StatsTracker
): Promise<string> {
  // Track export attempts
  note.exportAttempts = (note.exportAttempts || 0) + 1;

  try {
    const response = await request({
      user,
      endpoint: `/api/workspaces/${note.workspaceId}/notes/${note.globalId}/export`,
      method: "POST",
      body: JSON.stringify({
        language: "en",
        timezone: -300,
        workspaceId: note.workspaceId,
        noteGlobalId: note.globalId,
        format,
        style: "normal",
        size: "normal",
        paperFormat: "A4",
        folders: {},
      }),
      json: true,
    });

    if (!response.ok) {
      const text = await response.text();
      const error = `Export failed with status ${response.status}: ${text.substring(0, 200)}`;
      if (Config.debug) {
        console.error(`DEBUG: ${error}`);
      }
      if (stats) {
        stats.recordExportFailure(
          note,
          response.status === 429 ? FailureReason.RATE_LIMITED : FailureReason.SERVER_ERROR,
          error,
          note.exportAttempts
        );
      }
      throw new Error(error);
    }

    const json = await response.json() as { id: string; errorCode?: number };
    if (json.errorCode !== undefined && json.errorCode !== 0) {
      const error = `Export failed with errorCode ${json.errorCode}`;
      if (Config.debug) {
        console.error(`DEBUG: ${error}`);
      }
      if (stats) {
        stats.recordExportFailure(note, FailureReason.ERROR, error, note.exportAttempts);
      }
      throw new Error(error);
    }

    // Store the export ID for tracking
    note.exportId = json.id;

    if (Config.debug) {
      console.error(`DEBUG: Export request succeeded for note ${note.globalId}, export ID: ${json.id}`);
    }

    return json.id;
  } catch (e) {
    const error = e as Error;
    if (Config.debug) {
      console.error(`DEBUG: Export exception for note ${note.globalId}:`, error.message);
    }
    if (stats && !note.exportFailed) {
      // Determine failure reason
      let reason = FailureReason.UNKNOWN;
      if (error.message.includes("rate limit") || error.message.includes("429")) {
        reason = FailureReason.RATE_LIMITED;
      } else if (error.message.includes("timeout")) {
        reason = FailureReason.TIMEOUT;
      } else if (error.message.includes("network") || error.message.includes("ECONN")) {
        reason = FailureReason.NETWORK_ERROR;
      }
      stats.recordExportFailure(note, reason, error.message, note.exportAttempts);
    }
    throw e;
  }
}

export async function downloadNotes(
  user: User,
  notes: Note[],
  outputPath: string,
  spinner?: Ora,
  stats?: StatsTracker
): Promise<void> {
  if (!existsSync(outputPath)) await mkdir(outputPath);

  console.error(`DEBUG: Connecting to WebSocket at wss://${user.domain}`);
  const socket = io(`wss://${user.domain}`, {
    extraHeaders: { Cookie: `eversessionid=${user.sessionId}` },
    transports: ["websocket"],
  });

  await new Promise<void>((resolve, reject) => {
    socket.on("socketConnect:userConnected", () => resolve());
    socket.on("connect_error", (err) => {
      console.error(`DEBUG: WebSocket connection error:`, err);
      reject(new Error(`WebSocket connection failed: ${err.message}`));
    });
    socket.on("disconnect", (reason) => {
      console.error(`DEBUG: WebSocket disconnected:`, reason);
    });
  });
  console.error(`DEBUG: WebSocket connected successfully`);

  const pendingExports: Map<string, NodeJS.Timeout> = new Map();
  const completedExports: Set<string> = new Set();
  const failedExports: Set<string> = new Set();
  const messages: {
    message: { uuid: string; fileName: string; fileUrl: string };
    note: Note;
  }[] = [];

  // Track export requests
  const exportRequests: Map<string, ExportRequest> = new Map();

  await new Promise<void>((resolve, reject) => {
    // Handle successful exports
    socket.on("job:success", async (event: JobSuccessEvent) => {
      if (event?.message?.fileUrl && pendingExports.has(event?.message?.uuid)) {
        clearTimeout(pendingExports.get(event?.message?.uuid)!);
        pendingExports.delete(event?.message?.uuid);
        completedExports.add(event?.message?.uuid);

        const noteId = event?.message?.taskData?.noteGlobalId;
        const note = notes.find((note) => note.globalId === noteId);
        if (!note) {
          console.error("Couldn't find note for id", noteId);
          return;
        }

        if (stats) stats.recordExportSuccess(note);

        messages.push({ message: event.message, note });

        if (spinner)
          spinner.text = `Saving download urls (${completedExports.size + failedExports.size}/${
            notes.length
          })...`;

        // Check if all exports are complete (success or failure)
        if (pendingExports.size === 0) {
          socket.close();
          resolve();
        }
      }
    });

    // Handle failed exports
    socket.on("job:failure", async (event: JobFailureEvent) => {
      const exportId = event?.message?.uuid;
      if (exportId && pendingExports.has(exportId)) {
        clearTimeout(pendingExports.get(exportId)!);
        pendingExports.delete(exportId);
        failedExports.add(exportId);

        const noteId = event?.message?.taskData?.noteGlobalId;
        const note = notes.find((n) => n.globalId === noteId);

        if (note) {
          const errorMsg = event?.message?.error || "Unknown export failure";
          if (Config.debug) {
            console.error(`DEBUG: Export job failed for note ${note.globalId}: ${errorMsg}`);
          }
          if (stats) {
            stats.recordExportFailure(note, FailureReason.ERROR, errorMsg, note.exportAttempts || 1);
          }
        }

        if (spinner)
          spinner.text = `Saving download urls (${completedExports.size + failedExports.size}/${
            notes.length
          })...`;

        // Check if all exports are complete
        if (pendingExports.size === 0) {
          socket.close();
          resolve();
        }
      }
    });

    const pqueue = new PQueue({ concurrency: Config.exportConcurrency });

    if (spinner) {
      let count = 0;
      pqueue.on("active", () => {
        spinner.text = `Exporting notes (${++count}/${notes.length})`;
      });
    }

    // Submit all export requests
    pqueue.addAll(
      notes.map((note) => {
        return async () => {
          try {
            // Use retry logic for export requests
            const exportId = await retryOrThrow(
              () => exportNote(user, note, "html", stats),
              {
                maxRetries: Config.maxRetries,
                shouldRetry: (error) => {
                  // Retry on rate limits and transient errors
                  const msg = error.message.toLowerCase();
                  return (
                    msg.includes("rate limit") ||
                    msg.includes("429") ||
                    msg.includes("timeout") ||
                    msg.includes("network") ||
                    msg.includes("econn")
                  );
                },
                onRetry: (attempt, error) => {
                  if (Config.debug) {
                    console.error(
                      `DEBUG: Retrying export for note ${note.globalId}, attempt ${attempt}: ${error.message}`
                    );
                  }
                },
              }
            );

            // Track the export request
            exportRequests.set(exportId, { note, exportId, attempts: note.exportAttempts || 1 });

            // Set timeout for this export
            pendingExports.set(
              exportId,
              setTimeout(() => {
                if (pendingExports.has(exportId)) {
                  pendingExports.delete(exportId);
                  failedExports.add(exportId);

                  const req = exportRequests.get(exportId);
                  if (req && stats) {
                    stats.recordExportTimeout(req.note, exportId);
                  }

                  if (Config.debug) {
                    console.error(
                      `DEBUG: Export ${exportId} timed out after ${Config.exportTimeoutMs}ms`
                    );
                  }

                  // Check if all exports are complete
                  if (pendingExports.size === 0) {
                    socket.close();
                    resolve();
                  }
                }
              }, Config.exportTimeoutMs) as unknown as NodeJS.Timeout
            );
          } catch (e) {
            const error = e as Error;
            console.error(`DEBUG: Failed to export note ${note.globalId}:`, error.message);
            if (stats) {
              stats.recordExportFailure(
                note,
                error.message.includes("rate limit") ? FailureReason.RATE_LIMITED : FailureReason.ERROR,
                error.message,
                note.exportAttempts || 1
              );
            }
            // Mark as failed so we don't wait for it
            failedExports.add(note.globalId);
          }
        };
      })
    );

    if (spinner) spinner.text = `Waiting for download urls... (${pendingExports.size} exports pending)`;
  });

  console.error(
    `DEBUG: WebSocket closed. Exported: ${completedExports.size}, Failed: ${failedExports.size}, Timed out: ${pendingExports.size}`
  );

  if (spinner) spinner.text = `Starting download`;

  // Download completed exports
  let done = 0;
  const pqueue = new PQueue({ concurrency: Config.downloadConcurrency });
  await pqueue.addAll(
    messages.map((event) => {
      return async () => {
        const filename = sanitize(event.message.fileName, {
          replacement: "-",
        });

        if (existsSync(path.join(outputPath, filename))) {
          await rm(path.join(outputPath, filename));
        }

        const downloader = new Downloader({
          url: event.message.fileUrl,
          fileName: filename,
          directory: outputPath,
          shouldBufferResponse: true,
          timeout: Config.downloadTimeoutMs,
        });

        try {
          await downloader.download();

          if (stats) stats.recordDownloadSuccess();

          if (spinner)
            spinner.text = `Downloaded ${event.message.fileName} (${++done}/${
              messages.length
            })`;

          event.note.path = filename;
        } catch (e) {
          const error = e as Error;
          if (stats) {
            stats.recordDownloadFailure(event.note, error.message);
          }
          if (Config.debug) {
            console.error(`DEBUG: Failed to download ${filename}:`, error.message);
          }
        }
      };
    })
  );

  const notesWithPath = notes.filter((n) => n.path).length;
  console.error(
    `DEBUG: Download phase complete. ${notesWithPath}/${notes.length} notes have path property set`
  );
}
