import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StubGitHubRepoClient } from "../src/github/repos.js";
import { scaffoldWorkspace } from "../src/workspace/scaffolder.js";
import { buildWorkspaceFiles, type TemplateContext } from "../src/workspace/templates.js";

const ctx: TemplateContext = {
  repoOwner: "example-user",
  repoName: "bridge-workspace",
  createdAt: new Date("2026-10-12T00:00:00Z"),
  platforms: ["grok", "chatgpt", "gemini", "claude", "copilot"],
  connectorStatus: { grok: "connected", chatgpt: "pending" },
};

describe("workspace scaffolder", () => {
  it("renders AGENTS, STATE, HANDOFF, and SECURITY without owner-specific names", () => {
    const files = Object.fromEntries(buildWorkspaceFiles(ctx).map((f) => [f.path, f.content]));
    for (const name of ["AGENTS.md", "STATE.md", "HANDOFF.md", "SECURITY.md"]) {
      assert.ok(files[name], `missing ${name}`);
      assert.doesNotMatch(files[name], /CaliX|@gmail\.com|calix/i);
    }
    assert.match(files["STATE.md"], /review and revoke OAuth grants/);
    assert.match(files["SETUP.md"], /SETUP\.md version: 1\.0/);
    assert.match(files["gemini-sync.mjs"], /example-user/);
    assert.match(files["gemini-sync.mjs"], /GITHUB_TOKEN/);
    assert.match(files["AGENTS.md"], /Never commit secrets/);
  });

  it("writes those files into the user's private repo", async () => {
    const github = new StubGitHubRepoClient("example-user");
    await github.createPrivateRepo({ name: "bridge-workspace" });
    const written = await scaffoldWorkspace(github, ctx);
    assert.deepEqual(
      written.map((f) => f.path),
      ["AGENTS.md", "STATE.md", "HANDOFF.md", "SECURITY.md", "SETUP.md", "gemini-sync.mjs"],
    );
    const agents = await github.getFile({
      owner: "example-user",
      repo: "bridge-workspace",
      path: "AGENTS.md",
    });
    assert.match(agents.content, /single source of truth/);
  });
});
