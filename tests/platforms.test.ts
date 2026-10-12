import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLATFORM_GUIDES } from "../src/onboarding/platforms.js";
import { createOnboarding, markConnector, wizardSteps } from "../src/onboarding/wizard.js";
import { MemoryStore } from "../src/store.js";

describe("platform onboarding guides", () => {
  it("covers the five bridge platforms with revoke deep links and no tokens", () => {
    const ids = PLATFORM_GUIDES.map((g) => g.id);
    assert.deepEqual(ids, ["grok", "chatgpt", "gemini", "claude", "copilot"]);
    for (const guide of PLATFORM_GUIDES) {
      assert.ok(guide.connectUrl.startsWith("https://"));
      assert.ok(guide.revokeUrl.startsWith("https://"));
      assert.ok(guide.githubRevokeUrl.startsWith("https://github.com/settings/"));
      assert.doesNotMatch(JSON.stringify(guide), /token=|sk-|ghp_/);
    }
  });

  it("uses Apps & Connectors for ChatGPT, not Plugins", () => {
    const chatgpt = PLATFORM_GUIDES.find((g) => g.id === "chatgpt");
    assert.match(chatgpt?.connectionMethod || "", /Apps & Connectors/);
    assert.match(chatgpt?.notes || "", /NOT Plugins/);
  });

  it("tells operators that mcp.github.com is not a real Claude address", () => {
    const claude = PLATFORM_GUIDES.find((g) => g.id === "claude");
    assert.match(claude?.notes || "", /mcp\.github\.com is NOT a real address/);
    assert.match(claude?.connectUrl || "", /github-mcp-server/);
  });

  it("counts only GitHub Copilot, not Microsoft 365 Copilot", () => {
    const copilot = PLATFORM_GUIDES.find((g) => g.id === "copilot");
    assert.match(copilot?.notes || "", /Microsoft 365 Copilot does not/);
  });

  it("saves per-step connector status and resume progress", () => {
    const store = new MemoryStore();
    const user = store.createUser({ githubId: "1", githubLogin: "example-user" });
    const onboarding = createOnboarding(store, {
      userId: user.id,
      platforms: ["grok", "chatgpt"],
      repoMode: "new",
      existingRepo: null,
    });
    const steps = wizardSteps(onboarding.platforms);
    assert.equal(steps[0].kind, "select");
    assert.equal(steps[1].platform, "grok");
    markConnector(store, onboarding.id, "grok", "connected", new Date("2026-10-12T00:00:00Z"));
    const grok = store.listConnectors(onboarding.id).find((c) => c.platform === "grok");
    assert.equal(grok?.status, "connected");
    assert.match(grok?.notes || "", /connected via https:\/\/grok.com\/connectors on 2026-10-12/);
    const chatgpt = store.listConnectors(onboarding.id).find((c) => c.platform === "chatgpt");
    assert.equal(chatgpt?.status, "pending");
  });
});
