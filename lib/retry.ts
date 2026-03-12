/**
 * lib/retry.ts
 *
 * Zero-dependency exponential-backoff retry utility.
 *
 * Usage:
 *   import { withRetry } from "@/lib/retry";
 *
 *   const result = await withRetry(() => groq.chat.completions.create(...), {
 *     attempts: 3,
 *     label: "groq/chat",
 *   });
 *
 * Behaviour:
 *   - Retries on any thrown error (network errors, 5xx, rate limits, etc.)
 *   - Does NOT retry on errors explicitly marked non-retryable (see `isRetryable`)
 *   - Delays: 500ms → 1 000ms → 2 000ms (jittered ±20 %)
 *   - Logs each retry attempt with the label for easy grepping
 */

export interface RetryOptions {
  /** Number of total attempts (including the first). Default: 3 */
  attempts?: number;
  /** Base delay in ms before the first retry. Default: 500 */
  baseDelayMs?: number;
  /** Label for log messages. Default: "operation" */
  label?: string;
  /** Return false to skip retrying for a specific error. Default: always retry */
  isRetryable?: (err: unknown) => boolean;
}

function defaultIsRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    // Don't retry auth failures or 4xx client errors
    const msg = err.message.toLowerCase();
    if (msg.includes("401") || msg.includes("403") || msg.includes("400")) return false;
    if (msg.includes("unauthorized") || msg.includes("forbidden")) return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn`, retrying with exponential backoff on failure.
 *
 * @param fn           Async function to execute (called fresh on each attempt)
 * @param options      Retry configuration
 * @returns            Resolved value of `fn` on success
 * @throws             The last error if all attempts fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts    = 3,
    baseDelayMs = 500,
    label       = "operation",
    isRetryable = defaultIsRetryable,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLast    = attempt === attempts;
      const retryable = isRetryable(err);

      if (isLast || !retryable) {
        // Surface the final failure to the caller
        throw err;
      }

      // Exponential backoff with ±20% jitter
      const base  = baseDelayMs * 2 ** (attempt - 1);
      const jitter = base * 0.2 * (Math.random() * 2 - 1);
      const delay = Math.round(base + jitter);

      console.warn(
        `[retry] ${label} attempt ${attempt}/${attempts} failed — retrying in ${delay}ms`,
        err instanceof Error ? err.message : String(err),
      );

      await sleep(delay);
    }
  }

  throw lastError;
}
