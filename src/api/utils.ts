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

import makeFetchCookie from "fetch-cookie";
import { getRateLimiter } from "./rate-limiter";
import { withRetry, RETRYABLE_STATUS_CODES } from "./retry";
import { Config } from "./config";

const fetchCookie = makeFetchCookie(fetch);

export type RequestOptions = {
  user?: { domain?: string; sessionId?: string };
  endpoint: string;
  method: "POST" | "GET" | "HEAD";
  body?: string;
  json?: boolean;
  useRateLimit?: boolean;
  retry?: boolean;
};

/**
 * Enhanced request function with rate limiting and retry support
 */
export async function request(options: RequestOptions): Promise<Response> {
  const useRateLimit = options.useRateLimit !== false; // Default true
  const retry = options.retry !== false; // Default true

  const executeRequest = async (): Promise<Response> => {
    // Apply rate limiting before making the request
    if (useRateLimit) {
      await getRateLimiter().consume();
    }

    const { user, endpoint, method, body, json } = options;
    const domain = user?.domain || "nimbusweb.me";
    const referer = user ? `https://${domain}/client` : `https://${domain}/auth`;

    const response = await fetchCookie(`https://${domain}${endpoint}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0",
        Accept: "*/*",
        "Accept-Language": "en-GB,en;q=0.5",
        "Content-Type": json
          ? "application/json"
          : "application/x-www-form-urlencoded; charset=UTF-8",
        referer,
      },
      referrer: referer,
      body,
      method,
      credentials: "include",
    });

    // Check for rate limit response
    if (response.status === 429) {
      if (Config.debug) {
        console.error(`DEBUG: Rate limit detected on ${endpoint}`);
      }
      const error = new Error(`Rate limit exceeded: ${response.status}`);
      (error as any).statusCode = response.status;
      throw error;
    }

    // Check for other server errors
    if (!response.ok && retry && RETRYABLE_STATUS_CODES.has(response.status)) {
      const text = await response.text();
      const error = new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
      (error as any).statusCode = response.status;
      throw error;
    }

    return response;
  };

  // Apply retry logic if enabled
  if (retry) {
    const result = await withRetry(executeRequest, {
      maxRetries: Config.maxRetries,
      onRetry: (attempt, error) => {
        if (Config.debug) {
          console.error(
            `DEBUG: Request retry ${attempt}/${Config.maxRetries} for ${options.endpoint}: ${error.message}`
          );
        }
      },
    });

    if (result.success) {
      return result.value as Response;
    } else {
      throw result.error;
    }
  }

  return executeRequest();
}

/**
 * Simple request without rate limiting or retry (for backward compatibility)
 */
export async function simpleRequest(options: RequestOptions): Promise<Response> {
  return request({ ...options, useRateLimit: false, retry: false });
}
