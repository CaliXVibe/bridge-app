import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { GitHubApp } from "../src/github/app.js";
import { GitHubHttp } from "../src/github/client.js";
import { shouldBackoff } from "../src/github/rateLimit.js";
import { encodeRepoPath, LiveGitHubRepoClient } from "../src/github/repos.js";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("live-test hardening", () => {
  it("backs off on secondary rate limit (403 + Retry-After)", () => {
    assert.equal(shouldBackoff(403, new Headers({ "Retry-After": "30", "X-RateLimit-Remaining": "4000" })), true);
  });

  it("validates repo paths", () => {
    assert.equal(encodeRepoPath("a b/ü#.md"), "a%20b/%C3%BC%23.md");
    for (const bad of ["", "/x.md", "../x.md", "a//b.md", "a/./b.md", "a/"]) {
      assert.throws(() => encodeRepoPath(bad));
    }
  });

  it("retries a PUT on 409 conflict with a fresh sha", async () => {
    let puts = 0;
    let gets = 0;
    const http = new GitHubHttp({
      fetchImpl: async (_url, init) => {
        if (init?.method === "GET") {
          gets += 1;
          return json(200, { sha: `sha${gets}` });
        }
        puts += 1;
        return puts < 3 ? json(409, { message: "is at x but expected y" }) : json(201, { content: { sha: "new" } });
      },
    });
    const client = new LiveGitHubRepoClient(http, async () => "t", { sleep: async () => {} });
    const out = await client.putFile({ owner: "o", repo: "r", path: "f.md", content: "c", message: "m" });
    assert.equal(out.sha, "new");
    assert.equal(puts, 3);
    assert.equal(gets, 3);
  });

  it("gives up after conflictRetries", async () => {
    const http = new GitHubHttp({
      fetchImpl: async (_u, init) => (init?.method === "GET" ? json(404, {}) : json(409, { message: "conflict" })),
    });
    const client = new LiveGitHubRepoClient(http, async () => "t", { sleep: async () => {}, conflictRetries: 1 });
    await assert.rejects(client.putFile({ owner: "o", repo: "r", path: "f.md", content: "c", message: "m" }), /409/);
  });

  it("explains repo-creation refusal for installation tokens", async () => {
    const http = new GitHubHttp({ fetchImpl: async () => json(403, { message: "Resource not accessible by integration" }) });
    const client = new LiveGitHubRepoClient(http, async () => "t");
    await assert.rejects(client.createPrivateRepo({ name: "x" }), /installation token cannot create/);
  });

  it("caches installation tokens and dedupes concurrent mints", async () => {
    const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    let mints = 0;
    let now = Date.parse("2026-10-12T00:00:00Z");
    const http = new GitHubHttp({
      fetchImpl: async () => {
        mints += 1;
        return json(201, { token: `tok${mints}`, expires_at: new Date(now + 3600_000).toISOString() });
      },
    });
    const app = new GitHubApp(
      { appId: "1", privateKey: key, installationId: "9", clientId: "", clientSecret: "", webhookSecret: "", slug: "" },
      http,
      () => now,
    );
    const [a, b] = await Promise.all([app.installationToken(), app.installationToken()]);
    assert.equal(a, b);
    assert.equal(await app.installationToken(), a);
    assert.equal(mints, 1);
    now += 56 * 60_000;
    assert.equal(await app.installationToken(), "tok2");
  });

  it("serializes concurrent writes to the same repo", async () => {
    let active = 0;
    let maxActive = 0;
    const http = new GitHubHttp({
      fetchImpl: async (_u, init) => {
        if (init?.method === "GET") return json(404, {});
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return json(201, { content: { sha: "s" } });
      },
    });
    const client = new LiveGitHubRepoClient(http, async () => "t");
    await Promise.all(
      [1, 2, 3, 4].map((i) => client.putFile({ owner: "o", repo: "q", path: `f${i}.md`, content: "c", message: "m" })),
    );
    assert.equal(maxActive, 1);
  });
});
