// ============================================================
// CapitalForge — Fetch with Retry
//
// Wraps the native fetch API with automatic retry logic:
//   - 5xx errors:        retry with exponential backoff (1s, 2s, 4s)
//   - 401 Unauthorized:  never retry, return immediately
//   - Network failure:   retry once
// ============================================================

// ── Types ───────────────────────────────────────────────────────────────────

interface FetchWithRetryOptions extends RequestInit {
  /** Override per-retry backoff base in ms (default 1000). */
  backoffBaseMs?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isServerError(status: number): boolean {
  return status >= 500 && status < 600;
}

// ── Main ────────────────────────────────────────────────────────────────────

/**
 * Fetch wrapper with automatic retry on transient failures.
 *
 * @param url        Request URL
 * @param options    Standard fetch options + optional `backoffBaseMs`
 * @param maxRetries Maximum number of retry attempts (default 3)
 * @returns          The fetch Response
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
  maxRetries = 3,
): Promise<Response> {
  const { backoffBaseMs = 1_000, ...fetchOptions } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // 401 — never retry authentication failures
      if (response.status === 401) {
        return response;
      }

      // 5xx — retry with exponential backoff
      if (isServerError(response.status) && attempt < maxRetries) {
        const delay = backoffBaseMs * Math.pow(2, attempt); // 1s, 2s, 4s
        console.warn(
          `[fetchWithRetry] ${response.status} on ${url} — retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await wait(delay);
        continue;
      }

      // Any other status (including final 5xx after exhausting retries)
      return response;
    } catch (err) {
      lastError = err;

      // Network failure — retry once (attempt 0 fails -> attempt 1 retries)
      if (attempt < 1) {
        console.warn(
          `[fetchWithRetry] Network error on ${url} — retrying once`,
          err,
        );
        await wait(backoffBaseMs);
        continue;
      }

      // Exhausted network retries
      break;
    }
  }

  // All retries exhausted — throw the last error
  throw lastError;
}
