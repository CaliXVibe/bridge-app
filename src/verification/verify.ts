import type { GitHubRepoClient } from "../github/repos.js";
import { PLATFORM_GUIDES } from "../onboarding/platforms.js";
import type { Platform } from "../types.js";

export const VERIFY_PATH = "bridge-test.md";

export type PlatformVerifyResult = {
  platform: Platform;
  status: "github_readback_ok" | "pending_user_confirmation";
  instructions: string;
};

export type VerifyResult = {
  ok: boolean;
  path: string;
  timestamp: string;
  sha: string;
  readBack: string;
  githubReadbackMatched: boolean;
  platforms: PlatformVerifyResult[];
  instructions: string;
};

function testFileBody(timestamp: string, owner: string, repo: string): string {
  return `# Bridge verification

Timestamp: ${timestamp}

This file was pushed by Bridge App to \`${owner}/${repo}\`.

## Confirm another AI can read it

Ask a connected AI (for example Grok or ChatGPT with GitHub connected):

> Read \`${VERIFY_PATH}\` in \`${owner}/${repo}\` and quote the timestamp.

If it quotes \`${timestamp}\`, that platform can see the workspace.

Bridge App does not store AI platform tokens, so it cannot call those APIs itself.
`;
}

export async function verifyWorkspace(
  client: GitHubRepoClient,
  input: {
    owner: string;
    repo: string;
    platforms: Platform[];
    now?: Date;
  },
): Promise<VerifyResult> {
  const timestamp = (input.now ?? new Date()).toISOString();
  const content = testFileBody(timestamp, input.owner, input.repo);
  const written = await client.putFile({
    owner: input.owner,
    repo: input.repo,
    path: VERIFY_PATH,
    content,
    message: `Bridge verification ${timestamp}`,
  });
  const read = await client.getFile({
    owner: input.owner,
    repo: input.repo,
    path: VERIFY_PATH,
  });
  const githubReadbackMatched = read.content.includes(timestamp);

  const platforms: PlatformVerifyResult[] = input.platforms.map((platform) => {
    const guide = PLATFORM_GUIDES.find((g) => g.id === platform);
    return {
      platform,
      status: "pending_user_confirmation",
      instructions: `Ask ${guide?.name ?? platform} to read ${VERIFY_PATH} in ${input.owner}/${input.repo} and quote ${timestamp}. Confirm in the wizard when it matches. Revoke later at ${guide?.revokeUrl ?? ""}.`,
    };
  });

  return {
    ok: githubReadbackMatched,
    path: VERIFY_PATH,
    timestamp,
    sha: written.sha,
    readBack: read.content,
    githubReadbackMatched,
    platforms,
    instructions: `GitHub read-back ${githubReadbackMatched ? "passed" : "failed"}. Ask another connected AI to open ${VERIFY_PATH} and quote the timestamp ${timestamp}.`,
  };
}
