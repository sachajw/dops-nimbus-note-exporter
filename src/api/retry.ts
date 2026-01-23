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

import { Config } from "./config";

/**
 * Error types that should trigger a retry
 */
export const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests (Rate Limit)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

export const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

/**
 * Result type for retry operations
 */
export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
}

/**
 * Options for retry operations
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  multiplier: number
): number {
  const exponentialDelay = initialDelayMs * Math.pow(multiplier, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: Error): boolean {
  // Check for network error codes
  if (RETRYABLE_ERROR_CODES.has((error as any).code)) {
    return true;
  }

  // Check for HTTP status codes in error message
  const statusMatch = error.message.match(/status (\d{3})/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    return RETRYABLE_STATUS_CODES.has(status);
  }

  // Check for rate limit messages
  const message = error.message.toLowerCase();
  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("throttl")
  ) {
    return true;
  }

  // Check for timeout errors
  if (message.includes("timeout") || message.includes("timed out")) {
    return true;
  }

  return false;
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const maxRetries = options.maxRetries ?? Config.maxRetries;
  const initialDelayMs = options.initialDelayMs ?? Config.retryInitialDelayMs;
  const maxDelayMs = options.maxDelayMs ?? Config.retryMaxDelayMs;
  const multiplier = options.backoffMultiplier ?? 2;

  const shouldRetry = options.shouldRetry ?? isRetryableError;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const value = await fn();
      return {
        success: true,
        value,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt > maxRetries || !shouldRetry(lastError)) {
        break;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, initialDelayMs, maxDelayMs, multiplier);

      if (Config.debug) {
        console.error(
          `DEBUG: Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay. Error: ${lastError.message}`
        );
      }

      if (options.onRetry) {
        options.onRetry(attempt, lastError);
      }

      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxRetries + 1,
  };
}

/**
 * Execute a function with retry logic, throwing on final failure
 */
export async function retryOrThrow<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const result = await withRetry(fn, options);

  if (!result.success) {
    throw result.error ?? new Error("Retry failed with unknown error");
  }

  // Type guard: when success is true, value is guaranteed to be defined
  return result.value as T;
}
