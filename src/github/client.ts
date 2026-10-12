import {
  backoffMs,
  defaultSleep,
  GitHubRateLimitError,
  shouldBackoff,
  type SleepFn,
} from "./rateLimit.js";

export type GitHubFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type GitHubHttpOptions = {
  fetchImpl?: GitHubFetch;
  sleep?: SleepFn;
  now?: () => number;
  maxRetries?: number;
  maxWaitMs?: number;
  apiBase?: string;
};

export class GitHubHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, method: string, url: string) {
    super(`GitHub API ${method} ${url} failed with ${status}: ${body}`);
    this.name = "GitHubHttpError";
    this.status = status;
    this.body = body;
  }
}

export class GitHubHttp {
  private readonly fetchImpl: GitHubFetch;
  private readonly sleep: SleepFn;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly maxWaitMs: number;
  readonly apiBase: string;

  constructor(options: GitHubHttpOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.maxRetries = options.maxRetries ?? 5;
    this.maxWaitMs = options.maxWaitMs ?? 60_000;
    this.apiBase = options.apiBase ?? "https://api.github.com";
  }

  async request<T = unknown>(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.apiBase}${path}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const init: RequestInit = {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "bridge-app",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      };

      const response = await this.fetchImpl(url, init);

      if (shouldBackoff(response.status, response.headers)) {
        const wait = backoffMs(response.headers, attempt, this.now());
        const retryAt = this.now() + wait;
        if (wait > this.maxWaitMs) {
          throw new GitHubRateLimitError(wait, retryAt);
        }
        await this.sleep(wait);
        lastError = new GitHubRateLimitError(wait, retryAt);
        continue;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const text = await response.text();
      if (!response.ok) {
        throw new GitHubHttpError(response.status, text, method, url);
      }
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    }

    throw lastError ?? new Error(`GitHub API ${method} ${url} exhausted retries`);
  }
}
