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
 * Token bucket rate limiter implementation.
 *
 * This allows bursts of up to burstSize tokens, but refills at a steady rate.
 * This is better than a simple fixed delay because it allows for natural bursts
 * while still maintaining an average rate limit.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly refillRate: number; // tokens per millisecond
  private readonly maxTokens: number;

  constructor(
    private readonly requestsPerSecond: number = Config.rateLimitRequestsPerSecond,
    private readonly burstSize: number = Config.rateLimitBurstSize
  ) {
    this.maxTokens = burstSize;
    this.tokens = burstSize;
    this.refillRate = requestsPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed > 0) {
      const tokensToAdd = elapsed * this.refillRate;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Try to consume a token. Returns the time to wait if not available,
   * or 0 if a token was consumed.
   */
  public tryConsume(): number {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }

    // Calculate time until next token is available
    const tokensNeeded = 1 - this.tokens;
    const waitMs = tokensNeeded / this.refillRate;

    return waitMs;
  }

  /**
   * Wait until a token is available, then consume it
   */
  public async consume(): Promise<void> {
    let waitMs = this.tryConsume();

    while (waitMs > 0) {
      if (Config.debug) {
        console.error(`DEBUG: Rate limit reached, waiting ${waitMs}ms`);
      }

      await this.sleep(waitMs);
      waitMs = this.tryConsume();
    }
  }

  /**
   * Get current token count (for debugging)
   */
  public getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Global rate limiter instance
 */
let globalRateLimiter: RateLimiter | null = null;

/**
 * Get or create the global rate limiter
 */
export function getRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter();
  }
  return globalRateLimiter;
}

/**
 * Reset the global rate limiter (useful for testing)
 */
export function resetRateLimiter(): void {
  globalRateLimiter = null;
}
