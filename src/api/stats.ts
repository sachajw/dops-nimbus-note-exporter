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

import { Note } from "./types";

/**
 * Reason for export failure
 */
export enum FailureReason {
  TIMEOUT = "timeout",
  ERROR = "error",
  RATE_LIMITED = "rate_limited",
  NETWORK_ERROR = "network_error",
  SERVER_ERROR = "server_error",
  UNKNOWN = "unknown",
}

/**
 * Individual export failure record
 */
export interface ExportFailure {
  noteGlobalId: string;
  noteTitle: string;
  reason: FailureReason;
  error?: string;
  attempts: number;
}

/**
 * Comprehensive export statistics
 */
export interface ExportStats {
  // Total counts
  totalNotes: number;
  successfulExports: number;
  failedExports: number;
  timedOutExports: number;

  // Tag fetching stats
  tagFetchSuccess: number;
  tagFetchFailed: number;

  // Download stats
  downloadSuccess: number;
  downloadFailed: number;

  // Detailed failures
  failures: ExportFailure[];

  // Timing
  startTime: number;
  endTime?: number;
}

/**
 * Statistics tracker for the export process
 */
export class StatsTracker {
  private stats: ExportStats;

  constructor(totalNotes: number) {
    this.stats = {
      totalNotes,
      successfulExports: 0,
      failedExports: 0,
      timedOutExports: 0,
      tagFetchSuccess: 0,
      tagFetchFailed: 0,
      downloadSuccess: 0,
      downloadFailed: 0,
      failures: [],
      startTime: Date.now(),
    };
  }

  /**
   * Record a successful export
   */
  public recordExportSuccess(note: Note): void {
    this.stats.successfulExports++;
    // Remove from failures if it was previously marked as failed (retry)
    this.stats.failures = this.stats.failures.filter(
      (f) => f.noteGlobalId !== note.globalId
    );
  }

  /**
   * Record a failed export
   */
  public recordExportFailure(
    note: Note,
    reason: FailureReason,
    error?: string,
    attempts: number = 1
  ): void {
    this.stats.failedExports++;

    // Check if we already have a failure record for this note
    const existingFailure = this.stats.failures.find(
      (f) => f.noteGlobalId === note.globalId
    );

    if (existingFailure) {
      // Update existing failure record
      existingFailure.reason = reason;
      existingFailure.error = error;
      existingFailure.attempts = attempts;
    } else {
      // Add new failure record
      this.stats.failures.push({
        noteGlobalId: note.globalId,
        noteTitle: note.title,
        reason,
        error,
        attempts,
      });
    }
  }

  /**
   * Record a timed out export
   */
  public recordExportTimeout(note: Note, exportId: string): void {
    this.stats.timedOutExports++;
    this.recordExportFailure(note, FailureReason.TIMEOUT, `Export ID: ${exportId}`);
  }

  /**
   * Record a successful tag fetch
   */
  public recordTagFetchSuccess(): void {
    this.stats.tagFetchSuccess++;
  }

  /**
   * Record a failed tag fetch
   */
  public recordTagFetchFailed(): void {
    this.stats.tagFetchFailed++;
  }

  /**
   * Record a successful download
   */
  public recordDownloadSuccess(): void {
    this.stats.downloadSuccess++;
  }

  /**
   * Record a failed download
   */
  public recordDownloadFailure(note: Note, error: string): void {
    this.stats.downloadFailed++;
    this.recordExportFailure(note, FailureReason.NETWORK_ERROR, error);
  }

  /**
   * Mark the export process as complete
   */
  public markComplete(): void {
    this.stats.endTime = Date.now();
  }

  /**
   * Get the current statistics
   */
  public getStats(): Readonly<ExportStats> {
    return { ...this.stats };
  }

  /**
   * Get the duration of the export in milliseconds
   */
  public getDuration(): number {
    const end = this.stats.endTime || Date.now();
    return end - this.stats.startTime;
  }

  /**
   * Get the duration formatted as a human-readable string
   */
  public getFormattedDuration(): string {
    const ms = this.getDuration();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Check if all exports were successful
   */
  public isPerfect(): boolean {
    return (
      this.stats.failedExports === 0 &&
      this.stats.timedOutExports === 0 &&
      this.stats.downloadFailed === 0
    );
  }

  /**
   * Get the success rate as a percentage
   */
  public getSuccessRate(): number {
    if (this.stats.totalNotes === 0) return 0;
    return (this.stats.successfulExports / this.stats.totalNotes) * 100;
  }

  /**
   * Generate a summary string for display
   */
  public getSummary(): string {
    const lines: string[] = [];

    lines.push("\n" + "=".repeat(60));
    lines.push("EXPORT SUMMARY");
    lines.push("=".repeat(60));

    // Overall stats
    lines.push(`Total notes:           ${this.stats.totalNotes}`);
    lines.push(`Successful exports:    ${this.stats.successfulExports}`);
    if (this.stats.failedExports > 0) {
      lines.push(`Failed exports:        ${this.stats.failedExports}`);
    }
    if (this.stats.timedOutExports > 0) {
      lines.push(`Timed out exports:     ${this.stats.timedOutExports}`);
    }
    lines.push(`Success rate:          ${this.getSuccessRate().toFixed(1)}%`);
    lines.push(`Duration:              ${this.getFormattedDuration()}`);

    // Tag stats
    const totalTagFetches = this.stats.tagFetchSuccess + this.stats.tagFetchFailed;
    if (totalTagFetches > 0) {
      lines.push(`\nTag fetching:`);
      lines.push(`  Successful:          ${this.stats.tagFetchSuccess}/${totalTagFetches}`);
      if (this.stats.tagFetchFailed > 0) {
        lines.push(`  Failed:              ${this.stats.tagFetchFailed}/${totalTagFetches}`);
      }
    }

    // Download stats
    if (this.stats.downloadSuccess > 0 || this.stats.downloadFailed > 0) {
      const totalDownloads = this.stats.downloadSuccess + this.stats.downloadFailed;
      lines.push(`\nDownloads:`);
      lines.push(`  Successful:          ${this.stats.downloadSuccess}/${totalDownloads}`);
      if (this.stats.downloadFailed > 0) {
        lines.push(`  Failed:              ${this.stats.downloadFailed}/${totalDownloads}`);
      }
    }

    // Failures details
    if (this.stats.failures.length > 0) {
      lines.push(`\nFailed exports (${this.stats.failures.length}):`);
      for (const failure of this.stats.failures.slice(0, 10)) {
        lines.push(
          `  - ${failure.noteTitle} (${failure.noteGlobalId.substring(0, 8)}...)`
        );
        lines.push(`    Reason: ${failure.reason}${failure.error ? ` - ${failure.error}` : ""}`);
        lines.push(`    Attempts: ${failure.attempts}`);
      }
      if (this.stats.failures.length > 10) {
        lines.push(`  ... and ${this.stats.failures.length - 10} more failures`);
      }
    }

    lines.push("=".repeat(60));

    return lines.join("\n");
  }
}

/**
 * Null stats tracker for when stats are disabled
 */
export class NullStatsTracker implements Pick<StatsTracker, "recordExportSuccess" | "recordExportFailure" | "recordExportTimeout" | "recordTagFetchSuccess" | "recordTagFetchFailed" | "recordDownloadSuccess" | "recordDownloadFailure"> {
  public recordExportSuccess(_note: Note): void {}
  public recordExportFailure(_note: Note, _reason: FailureReason, _error?: string): void {}
  public recordExportTimeout(_note: Note, _exportId: string): void {}
  public recordTagFetchSuccess(): void {}
  public recordTagFetchFailed(): void {}
  public recordDownloadSuccess(): void {}
  public recordDownloadFailure(_note: Note, _error: string): void {}
}
