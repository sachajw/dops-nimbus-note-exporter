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

/**
 * Configuration management for the Nimbus Note exporter.
 * All configurable values are read from environment variables.
 */
export class Config {
  // Existing credentials
  static get email(): string | undefined {
    return process.env.NIMBUS_EMAIL;
  }

  static get password(): string | undefined {
    return process.env.NIMBUS_PASSWORD;
  }

  static get workspace(): string | undefined {
    return process.env.NIMBUS_WORKSPACE;
  }

  static get folder(): string | undefined {
    return process.env.NIMBUS_FOLDER;
  }

  static get outputPath(): string {
    return process.env.NIMBUS_OUTPUT_PATH || "./nimbus-export.zip";
  }

  // New configuration options for rate limiting and concurrency
  static get tagConcurrency(): number {
    const val = process.env.NIMBUS_TAG_CONCURRENCY;
    return val ? Math.max(1, parseInt(val, 10)) : 16;
  }

  static get exportConcurrency(): number {
    const val = process.env.NIMBUS_EXPORT_CONCURRENCY;
    return val ? Math.max(1, parseInt(val, 10)) : 10;
  }

  static get downloadConcurrency(): number {
    const val = process.env.NIMBUS_DOWNLOAD_CONCURRENCY;
    return val ? Math.max(1, parseInt(val, 10)) : 8;
  }

  static get exportTimeoutMs(): number {
    const val = process.env.NIMBUS_EXPORT_TIMEOUT;
    return val ? Math.max(60000, parseInt(val, 10)) : 300000; // Default 5 minutes
  }

  static get downloadTimeoutMs(): number {
    const val = process.env.NIMBUS_DOWNLOAD_TIMEOUT;
    return val ? Math.max(10000, parseInt(val, 10)) : 60000; // Default 60 seconds
  }

  static get maxRetries(): number {
    const val = process.env.NIMBUS_MAX_RETRIES;
    return val ? Math.max(0, parseInt(val, 10)) : 3;
  }

  static get retryInitialDelayMs(): number {
    const val = process.env.NIMBUS_RETRY_INITIAL_DELAY;
    return val ? Math.max(100, parseInt(val, 10)) : 1000; // Default 1 second
  }

  static get retryMaxDelayMs(): number {
    const val = process.env.NIMBUS_RETRY_MAX_DELAY;
    return val ? Math.max(1000, parseInt(val, 10)) : 30000; // Default 30 seconds
  }

  static get rateLimitRequestsPerSecond(): number {
    const val = process.env.NIMBUS_RATE_LIMIT_RPS;
    return val ? Math.max(1, parseInt(val, 10)) : 10; // Default 10 requests/second
  }

  static get rateLimitBurstSize(): number {
    const val = process.env.NIMBUS_RATE_LIMIT_BURST;
    return val ? Math.max(1, parseInt(val, 10)) : 20; // Default burst of 20
  }

  // Debug mode for verbose logging
  static get debug(): boolean {
    return process.env.NIMBUS_DEBUG === "true" || process.env.NIMBUS_DEBUG === "1";
  }

  // WORKAROUND: Extended wait time for delayed job:success events (in milliseconds)
  static get extendedWaitMs(): number {
    const val = process.env.NIMBUS_EXTENDED_WAIT;
    return val ? Math.max(0, parseInt(val, 10)) : 600000; // Default 10 minutes
  }

  // WORKAROUND: Enable URL prediction recovery for timed-out exports
  static get enableUrlPrediction(): boolean {
    return process.env.NIMBUS_ENABLE_URL_PREDICTION !== "false"; // Default true
  }

  // Resume mode: path to existing export to extract already-exported note IDs
  static get resumeFromArchive(): string | undefined {
    return process.env.NIMBUS_RESUME_FROM;
  }

  // Failed notes file: path to save failed note IDs for retry
  static get failedNotesFile(): string {
    return process.env.NIMBUS_FAILED_NOTES_FILE || "./failed-notes.json";
  }

  // Retry only mode: path to JSON file with note IDs to retry
  static get retryOnlyFile(): string | undefined {
    return process.env.NIMBUS_RETRY_ONLY;
  }
}
