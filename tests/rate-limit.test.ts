import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GitHubHttp } from "../src/github/client.js";
import { backoffMs, GitHubRateLimitError, shouldBackoff } from "../src/github/rateLimit.js";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("GitHub rate-limit backoff", () => {
  it("backs off on 429 and on 403 with remaining 0", () => {
    assert.equal(shouldBackoff(429, headers({})), true);
    assert.equal(shouldBackoff(403, headers({ "X-RateLimit-Remaining": "0" })), true);
    assert.equal(shouldBackoff(403, headers({ "X-RateLimit-Remaining": "12" })), false);
    assert.equal(shouldBackoff(200, headers({ "X-RateLimit-Remaining": "0" })), false);
  });

  it("honors Retry-After seconds and X-RateLimit-Reset", () => {
    const now = Date.parse("2026-10-12T00:00:00Z");
    assert.equal(backoffMs(headers({ "Retry-After": "7" }), 0, now), 7000);
    assert.equal(
      backoffMs(headers({ "X-RateLimit-Reset": String(now / 1000 + 15) }), 0, now),
      15_000,
    );
  });

  it("retries after 429 then succeeds", async () => {
    let calls = 0;
    const slept: number[] = [];
    const http = new GitHubHttp({
      sleep: async (ms) => {
        slept.push(ms);
      },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("slow down", {
            status: 429,
            headers: { "Retry-After": "1" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    const result = await http.request<{ ok: boolean }>("GET", "/rate_limit", "token");
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.deepEqual(slept, [1000]);
  });

  it("throws when reset wait exceeds maxWaitMs", async () => {
    const http = new GitHubHttp({
      maxWaitMs: 100,
      sleep: async () => {
        throw new Error("should not sleep");
      },
      fetchImpl: async () =>
        new Response("forbidden", {
          status: 403,
          headers: { "X-RateLimit-Remaining": "0", "Retry-After": "30" },
        }),
    });
    await assert.rejects(() => http.request("GET", "/user", "token"), GitHubRateLimitError);
  });
});
