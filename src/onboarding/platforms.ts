import type { Platform } from "../types.js";

export type PlatformGuide = {
  id: Platform;
  name: string;
  wizardStep: number;
  connectionMethod: string;
  readWrite: string;
  native: boolean;
  connectUrl: string;
  revokeUrl: string;
  githubRevokeUrl: string;
  notes: string;
  steps: string[];
  confirmationPrompt: string;
};

const GITHUB_OAUTH_REVOKE = "https://github.com/settings/applications";
const GITHUB_APP_REVOKE = "https://github.com/settings/installations";

export const PLATFORM_GUIDES: PlatformGuide[] = [
  {
    id: "grok",
    name: "Grok",
    wizardStep: 2,
    connectionMethod: "grok.com/connectors → GitHub OAuth",
    readWrite: "Full (search, read, push, PRs, issues)",
    native: true,
    connectUrl: "https://grok.com/connectors",
    revokeUrl: "https://grok.com/connectors",
    githubRevokeUrl: GITHUB_OAUTH_REVOKE,
    notes: "Native connector, one tap. Complete OAuth Allow on GitHub, then confirm here.",
    steps: [
      "Open grok.com/connectors.",
      "Choose GitHub and complete the OAuth Allow prompt on GitHub's site.",
      "Name the private workspace repo in a Grok chat to confirm the grant landed.",
    ],
    confirmationPrompt: "I completed the Grok GitHub connector OAuth Allow prompt.",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    wizardStep: 3,
    connectionMethod: "Settings → Apps & Connectors → GitHub app",
    readWrite: "Read and write repos",
    native: true,
    connectUrl: "https://chatgpt.com/",
    revokeUrl: "https://chatgpt.com/",
    githubRevokeUrl: GITHUB_OAUTH_REVOKE,
    notes:
      "Path is Apps & Connectors, NOT Plugins. After connecting, review the GitHub repo scope — it is full read-write.",
    steps: [
      "In ChatGPT, open Settings → Apps & Connectors (not Plugins).",
      "Connect the GitHub app and approve access to the private workspace repo.",
      "Review grants at GitHub Settings → Applications → Authorized OAuth Apps.",
    ],
    confirmationPrompt: "I connected ChatGPT via Settings → Apps & Connectors → GitHub.",
  },
  {
    id: "gemini",
    name: "Gemini",
    wizardStep: 4,
    connectionMethod: "AI Studio two-way GitHub sync; Drive Projects for Workspace users",
    readWrite: "Two-way in AI Studio; upload-only on web",
    native: false,
    connectUrl: "https://aistudio.google.com/",
    revokeUrl: "https://myaccount.google.com/permissions",
    githubRevokeUrl: GITHUB_OAUTH_REVOKE,
    notes:
      "No real connector catalog. Primary path is Google AI Studio two-way GitHub sync. Fallback is a local GitHub API sync script (token stays in your environment).",
    steps: [
      "Open Google AI Studio and link the private workspace repo for two-way GitHub sync when the UI offers it.",
      "If AI Studio cannot link GitHub, download the generated sync script and run it locally with GITHUB_TOKEN from your vault.",
      "Gemini on the public web is upload-only — do not treat that as connected.",
    ],
    confirmationPrompt: "I enabled AI Studio GitHub sync, or I will use the local sync-script fallback.",
  },
  {
    id: "claude",
    name: "Claude",
    wizardStep: 5,
    connectionMethod: "Claude GitHub connector or official GitHub MCP server",
    readWrite: "Repo access via MCP",
    native: true,
    connectUrl: "https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-claude.md",
    revokeUrl: "https://claude.ai/settings",
    githubRevokeUrl: GITHUB_APP_REVOKE,
    notes:
      "mcp.github.com is NOT a real address. Use Claude's GitHub connector if shown, or GitHub's official MCP server (ghcr.io/github/github-mcp-server or https://api.githubcopilot.com/mcp/).",
    steps: [
      "Prefer Claude's built-in GitHub connector when available (Settings → Connectors).",
      "Otherwise install GitHub's official MCP server using the Claude install guide — not mcp.github.com.",
      "Remote MCP URL, when used, is https://api.githubcopilot.com/mcp/ with a token that stays in Claude's config, never in Bridge App.",
    ],
    confirmationPrompt: "I connected Claude via its GitHub connector or the official GitHub MCP server.",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    wizardStep: 6,
    connectionMethod: "Built-in GitHub access",
    readWrite: "Direct repo read",
    native: true,
    connectUrl: "https://github.com/settings/copilot",
    revokeUrl: "https://github.com/settings/copilot",
    githubRevokeUrl: GITHUB_APP_REVOKE,
    notes:
      "Only GitHub Copilot counts as connected. Microsoft 365 Copilot does not read this repo and is not a bridge target. Nothing extra to connect if GitHub Copilot already sees the workspace.",
    steps: [
      "Confirm you are using GitHub Copilot (in GitHub, VS Code, or github.com), not Microsoft 365 Copilot.",
      "Open the private workspace repo in an environment where GitHub Copilot is enabled.",
      "No OAuth connector step — native access only.",
    ],
    confirmationPrompt: "I am using GitHub Copilot (not Microsoft 365 Copilot) with this repo.",
  },
];

export function guideFor(platform: Platform): PlatformGuide {
  const guide = PLATFORM_GUIDES.find((item) => item.id === platform);
  if (!guide) throw new Error(`Unknown platform: ${platform}`);
  return guide;
}

export function connectorNote(platform: Platform, at: Date): string {
  const guide = guideFor(platform);
  const day = at.toISOString().slice(0, 10);
  return `connected via ${guide.connectUrl} on ${day}`;
}
