export class GitHubRateLimitError extends Error {
  readonly retryAtMs: number;
  readonly waitMs: number;

  constructor(waitMs: number, retryAtMs: number) {
    super(`GitHub rate limited; retry after ${Math.ceil(waitMs / 1000)}s`);
    this.name = "GitHubRateLimitError";
    this.waitMs = waitMs;
    this.retryAtMs = retryAtMs;
  }
}

export function shouldBackoff(status: number, headers: Headers): boolean {
  if (status === 429) return true;
  if (status === 403 && headers.get("X-RateLimit-Remaining") === "0") return true;
  // Secondary rate limits: 403 with Retry-After but remaining > 0.
  if (status === 403 && headers.get("Retry-After")) return true;
  return false;
}

export function backoffMs(headers: Headers, attempt: number, nowMs = Date.now()): number {
  const retryAfter = headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - nowMs);
  }

  const reset = headers.get("X-RateLimit-Reset");
  if (reset) {
    const resetMs = Number(reset) * 1000;
    if (!Number.isNaN(resetMs)) return Math.max(0, resetMs - nowMs);
  }

  return Math.min(1000 * 2 ** attempt, 30_000);
}

export type SleepFn = (ms: number) => Promise<void>;

export const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
