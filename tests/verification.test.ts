import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StubGitHubRepoClient } from "../src/github/repos.js";
import { verifyWorkspace, VERIFY_PATH } from "../src/verification/verify.js";

describe("verification", () => {
  it("pushes a timestamped test file and reads the same bytes back", async () => {
    const github = new StubGitHubRepoClient("example-user");
    await github.createPrivateRepo({ name: "bridge-workspace" });
    const result = await verifyWorkspace(github, {
      owner: "example-user",
      repo: "bridge-workspace",
      platforms: ["grok", "chatgpt"],
      now: new Date("2026-10-12T15:00:00Z"),
    });
    assert.equal(result.ok, true);
    assert.equal(result.path, VERIFY_PATH);
    assert.equal(result.githubReadbackMatched, true);
    assert.match(result.readBack, /2026-10-12T15:00:00.000Z/);
    const stored = await github.getFile({
      owner: "example-user",
      repo: "bridge-workspace",
      path: VERIFY_PATH,
    });
    assert.equal(stored.content, result.readBack);
    assert.equal(result.platforms.length, 2);
    assert.equal(result.platforms[0].status, "pending_user_confirmation");
    assert.match(result.instructions, /another connected AI/);
  });
});
