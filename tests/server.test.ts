import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createHmac } from "node:crypto";

type CookieJar = { cookie?: string; csrf?: string };

async function listen(app: ReturnType<typeof createApp>): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function request(
  port: number,
  path: string,
  jar: CookieJar,
  init: RequestInit = {},
): Promise<{ status: number; json: unknown; text: string; headers: Headers }> {
  const headers = new Headers(init.headers);
  if (jar.cookie) headers.set("Cookie", jar.cookie);
  if (jar.csrf && init.method && init.method !== "GET") headers.set("x-csrf-token", jar.csrf);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers });
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") || ""];
  for (const header of setCookies) {
    const match = header.match(/bridge_sid=[^;]+/);
    if (match) jar.cookie = match[0];
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

describe("Express server", () => {
  it("serves /health, stub /dashboard, and a stub onboarding + verify flow", async () => {
    const config = loadConfig({
      PORT: "3000",
      GITHUB_STUB: "true",
      SESSION_SECRET: "test-secret",
      APP_BASE_URL: "http://127.0.0.1",
    });
    const app = createApp({ config });
    const { port, close } = await listen(app);
    const jar: CookieJar = {};
    try {
      const health = await request(port, "/health", jar);
      assert.equal(health.status, 200);
      assert.deepEqual(health.json, { ok: true, service: "bridge-app" });

      const dashboard = await request(port, "/dashboard", jar);
      assert.equal(dashboard.status, 200);
      assert.match(dashboard.text, /Dashboard/);
      assert.match(dashboard.text, /stub/);

      const session = await request(port, "/api/session", jar);
      assert.equal(session.status, 200);
      jar.csrf = (session.json as { csrfToken: string }).csrfToken;
      assert.equal((session.json as { stubMode: boolean }).stubMode, true);

      const stubSignIn = await request(port, "/api/session/stub", jar, { method: "POST" });
      assert.equal(stubSignIn.status, 200);

      const platforms = await request(port, "/api/platforms", jar);
      assert.equal((platforms.json as { platforms: unknown[] }).platforms.length, 5);

      const created = await request(port, "/api/onboarding", jar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platforms: ["grok", "chatgpt", "gemini", "claude", "copilot"],
          repoMode: "new",
        }),
      });
      assert.equal(created.status, 201);
      const onboardingId = (created.json as { id: string }).id;

      const patched = await request(port, `/api/onboarding/${onboardingId}`, jar, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStep: 2, platform: "grok", status: "connected" }),
      });
      assert.equal(patched.status, 200);
      const grok = (patched.json as { connectors: { platform: string; status: string; notes: string }[] }).connectors.find(
        (c) => c.platform === "grok",
      );
      assert.equal(grok?.status, "connected");
      assert.match(grok?.notes || "", /connected via/);

      const workspace = await request(port, `/api/onboarding/${onboardingId}/workspace`, jar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoName: "bridge-workspace" }),
      });
      assert.equal(workspace.status, 201);
      assert.equal((workspace.json as { workspace: { visibility: string } }).workspace.visibility, "private");

      const scaffold = await request(port, `/api/onboarding/${onboardingId}/scaffold`, jar, {
        method: "POST",
      });
      assert.equal(scaffold.status, 200);
      assert.ok(
        (scaffold.json as { files: string[] }).files.includes("AGENTS.md"),
      );

      const verify = await request(port, `/api/onboarding/${onboardingId}/verify`, jar, {
        method: "POST",
      });
      assert.equal(verify.status, 200);
      assert.equal((verify.json as { ok: boolean }).ok, true);
      assert.equal((verify.json as { githubReadbackMatched: boolean }).githubReadbackMatched, true);
    } finally {
      await close();
    }
  });

  it("accepts a signed GitHub ping webhook without creating an App registration", async () => {
    const secret = "whsec";
    const config = loadConfig({
      PORT: "3000",
      GITHUB_STUB: "true",
      GITHUB_WEBHOOK_SECRET: secret,
      SESSION_SECRET: "test-secret",
    });
    const app = createApp({ config });
    const { port, close } = await listen(app);
    try {
      const body = JSON.stringify({ zen: "non-blocking" });
      const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
      const res = await fetch(`http://127.0.0.1:${port}/webhooks/github`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Event": "ping",
          "X-Hub-Signature-256": signature,
        },
        body,
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as { handled: string };
      assert.equal(json.handled, "pong");
    } finally {
      await close();
    }
  });
});
