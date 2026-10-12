import assert from "node:assert/strict";
import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { GitHubApp, verifyWebhookSignature } from "../src/github/app.js";
import { GitHubHttp } from "../src/github/client.js";
import { createAppJwt } from "../src/github/jwt.js";
import { LiveGitHubRepoClient, StubGitHubRepoClient } from "../src/github/repos.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const pub = publicKey.export({ type: "spki", format: "pem" }).toString();

describe("GitHub App JWT and webhook", () => {
  it("signs an RS256 JWT with the App ID as issuer", () => {
    const jwt = createAppJwt("12345", pem, Date.parse("2026-10-12T00:00:00Z"));
    const [headerB64, payloadB64, signature] = jwt.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    assert.equal(payload.iss, "12345");
    assert.equal(JSON.parse(Buffer.from(headerB64, "base64url").toString()).alg, "RS256");
    const verify = createVerify("RSA-SHA256");
    verify.update(`${headerB64}.${payloadB64}`);
    assert.equal(verify.verify(pub, signature, "base64url"), true);
  });

  it("rejects JWT creation without env-backed credentials", () => {
    assert.throws(() => createAppJwt("", pem), /App ID/);
    assert.throws(() => createAppJwt("1", ""), /private key/);
  });

  it("verifies webhook signatures and rejects mismatches", () => {
    const body = Buffer.from('{"zen":"ok"}');
    const secret = "webhook-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    assert.equal(verifyWebhookSignature(body, signature, secret), true);
    assert.equal(verifyWebhookSignature(body, signature, "other"), false);
    assert.equal(verifyWebhookSignature(body, undefined, secret), false);
  });

  it("mints an installation token via POST /app/installations/:id/access_tokens", async () => {
    const calls: string[] = [];
    const http = new GitHubHttp({
      fetchImpl: async (url, init) => {
        calls.push(`${init?.method} ${url}`);
        assert.match(String((init?.headers as Record<string, string>).Authorization), /^Bearer eyJ/);
        return new Response(JSON.stringify({ token: "ghs_install" }), { status: 201 });
      },
    });
    const app = new GitHubApp(
      {
        appId: "12345",
        clientId: "client",
        clientSecret: "secret",
        privateKey: pem,
        webhookSecret: "wh",
        slug: "bridge",
        installationId: "99",
      },
      http,
    );
    const token = await app.installationToken();
    assert.equal(token, "ghs_install");
    assert.equal(calls[0], "POST https://api.github.com/app/installations/99/access_tokens");
  });
});

describe("GitHub repo client", () => {
  it("creates a private repo, puts a file, and reads it back (live HTTP mock)", async () => {
    const files = new Map<string, { content: string; sha: string }>();
    const http = new GitHubHttp({
      fetchImpl: async (url, init) => {
        const method = init?.method || "GET";
        if (method === "POST" && String(url).endsWith("/user/repos")) {
          const body = JSON.parse(String(init?.body));
          assert.equal(body.private, true);
          return new Response(
            JSON.stringify({
              private: true,
              html_url: "https://github.com/stub-user/ws",
              name: body.name,
              owner: { login: "stub-user" },
            }),
            { status: 201 },
          );
        }
        const contents = String(url).match(/\/repos\/(.+)\/(.+)\/contents\/(.+)$/);
        if (contents) {
          const path = decodeURIComponent(contents[3]);
          if (method === "GET") {
            const found = files.get(path);
            if (!found) return new Response("missing", { status: 404 });
            return new Response(
              JSON.stringify({
                path,
                sha: found.sha,
                content: Buffer.from(found.content).toString("base64"),
                encoding: "base64",
              }),
              { status: 200 },
            );
          }
          if (method === "PUT") {
            const body = JSON.parse(String(init?.body));
            files.set(path, { content: Buffer.from(body.content, "base64").toString("utf8"), sha: "abc" });
            return new Response(JSON.stringify({ content: { sha: "abc" } }), { status: 201 });
          }
        }
        return new Response("nope", { status: 500 });
      },
    });
    const client = new LiveGitHubRepoClient(http, async () => "ghu_from_app_oauth");
    const repo = await client.createPrivateRepo({ name: "ws" });
    assert.equal(repo.private, true);
    await client.putFile({
      owner: repo.owner,
      repo: repo.name,
      path: "note.md",
      content: "hello",
      message: "add note",
    });
    const read = await client.getFile({ owner: repo.owner, repo: repo.name, path: "note.md" });
    assert.equal(read.content, "hello");
  });

  it("refuses a non-private create response and does not patch visibility", async () => {
    const http = new GitHubHttp({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            private: false,
            html_url: "https://github.com/stub-user/public-ws",
            name: "public-ws",
            owner: { login: "stub-user" },
          }),
          { status: 201 },
        ),
    });
    const client = new LiveGitHubRepoClient(http, async () => "token");
    await assert.rejects(
      () => client.createPrivateRepo({ name: "public-ws" }),
      /never changes visibility/,
    );
  });

  it("stub client round-trips files without passwords or tokens", async () => {
    const stub = new StubGitHubRepoClient();
    const repo = await stub.createPrivateRepo({ name: "bridge-workspace" });
    assert.equal(repo.private, true);
    await stub.putFile({
      owner: repo.owner,
      repo: repo.name,
      path: "x.md",
      content: "y",
      message: "m",
    });
    const read = await stub.getFile({ owner: repo.owner, repo: repo.name, path: "x.md" });
    assert.equal(read.content, "y");
  });
});
