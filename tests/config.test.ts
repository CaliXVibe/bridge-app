import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";

describe("config", () => {
  it("enables the GitHub stub when App credentials are absent", () => {
    const config = loadConfig({ PORT: "4000" });
    assert.equal(config.githubStub, true);
    assert.equal(config.port, 4000);
    assert.equal(config.github.appId, "");
    assert.equal(config.github.privateKey, "");
  });

  it("treats GITHUB_STUB=true as stub even if an App ID is present", () => {
    const config = loadConfig({
      GITHUB_STUB: "true",
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----",
    });
    assert.equal(config.githubStub, true);
    assert.match(config.github.privateKey, /BEGIN PRIVATE KEY/);
    assert.doesNotMatch(config.github.privateKey, /\\n/);
  });
});
