import { connectorNote, guideFor } from "../onboarding/platforms.js";
import type { ConnectorStatus, Platform } from "../types.js";

export type TemplateContext = {
  repoOwner: string;
  repoName: string;
  createdAt: Date;
  platforms: Platform[];
  connectorStatus: Partial<Record<Platform, ConnectorStatus>>;
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextQuarter(from: Date): string {
  const next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + 3);
  return isoDay(next);
}

export function renderAgentsMd(_ctx: TemplateContext): string {
  return `# AGENTS.md

Instructions for any AI agent working in this repository.

## Purpose

This repo is a shared workspace bridged across multiple AI platforms (Grok, ChatGPT, Gemini, Claude, Copilot). Any agent may read and write here. The repo is the single source of truth for handoffs.

## Rules

1. **Read before writing.** Check STATE.md and HANDOFF.md before starting work so you know what the last agent did and what is in progress.
2. **Update STATE.md** at the end of every session: current status, last-touched-by (platform + model), and next steps.
3. **Append to HANDOFF.md** for anything the next agent needs to know — decisions, blockers, file paths, commands that worked.
4. **Never commit secrets.** No API keys, tokens, passwords, or personal data in repo files. Use environment variables or a secrets manager (1Password / Bitwarden) and reference them by name only.
5. **Nothing destructive without explicit owner confirmation.** No force-pushes, deletions, or revocations unless the owner says so in chat.
6. **Pace API calls.** Respect platform rate limits (GitHub: 5,000 requests/hour authenticated; 80 content-creating requests/minute). On 429, honor Retry-After or sleep until X-RateLimit-Reset, then retry with backoff.
7. **Keep the repo private.** Connected data can flow into prompts, caches, and training-adjacent artifacts on each platform. The repo is the one place you can audit and delete.

## File conventions

- \`AGENTS.md\` — this file. Standing instructions for all agents.
- \`STATE.md\` — current status snapshot. Overwrite each session.
- \`HANDOFF.md\` — append-only session notes for the next agent.
- \`SECURITY.md\` — token hygiene, 2FA, revocation checklist.

## Platform notes

- **Grok:** native GitHub connector (grok.com/connectors). Can search, read, push, open PRs, manage issues.
- **ChatGPT:** GitHub app / connectors. Read and write repos. Path is Settings → Apps & Connectors, not Plugins.
- **Gemini:** two-way GitHub sync in AI Studio; web version is upload-only.
- **Claude:** GitHub via official MCP server or Claude's GitHub connector. \`mcp.github.com\` is not a real address.
- **Copilot:** built-in GitHub access (GitHub Copilot only; Microsoft 365 Copilot is not connected).
- **Google Drive:** Grok, ChatGPT, Gemini (strongest on Gemini via Workspace).
- **Notion:** Grok, ChatGPT.
- **Linear:** Grok, ChatGPT.

## Security checklist (see SECURITY.md)

- [ ] 2FA enabled on every bridged account (authenticator app or passkey, not SMS)
- [ ] Password manager in use (1Password or Bitwarden) with unique passwords per account
- [ ] OAuth grants reviewed after setup (Settings → Applications → Authorized OAuth Apps)
- [ ] Quarterly token rotation reminder logged in STATE.md
`;
}

export function renderStateMd(ctx: TemplateContext): string {
  const rows = ctx.platforms
    .map((platform) => {
      const guide = guideFor(platform);
      const status = ctx.connectorStatus[platform] ?? "pending";
      return `| ${guide.name} | ${status} | ${guide.connectionMethod} |`;
    })
    .join("\n");

  return `# STATE.md

Current status of this workspace. Overwrite at the end of each session.

## Status

- **Phase:** scaffolded (templates only)
- **Last updated:** ${isoDay(ctx.createdAt)}
- **Last touched by:** Bridge App setup
- **Repo:** ${ctx.repoOwner}/${ctx.repoName}

## In progress

- None yet. This is the initial scaffold.

## Next steps

1. Connect GitHub on each bridged platform (Grok connector, ChatGPT app, Gemini AI Studio sync, Claude MCP, Copilot built-in).
2. Complete the security checklist in SECURITY.md.
3. Add the first real task and let an agent pick it up.

## Quarterly rotation reminder

- **Next review:** ${nextQuarter(ctx.createdAt)} — review and revoke OAuth grants, then rotate connected tokens and API keys.
- Log the result here when done.

## Connected platforms

| Platform | Connected | Notes |
|----------|-----------|-------|
${rows}
`;
}

export function renderHandoffMd(ctx: TemplateContext): string {
  return `# HANDOFF.md

Append-only notes for the next agent. Newest entries at the bottom.

---

## ${isoDay(ctx.createdAt)} — Bridge App setup

- Created \`${ctx.repoOwner}/${ctx.repoName}\` as a private scaffold for multi-platform AI handoffs.
- Added AGENTS.md (standing instructions), STATE.md (status snapshot), SECURITY.md (token hygiene checklist), SETUP.md (version 1.0).
- No real work has been done yet. First task is connecting each platform and completing the security checklist.
`;
}

export function renderSecurityMd(_ctx: TemplateContext): string {
  return `# SECURITY.md

Token hygiene, 2FA, and revocation for this bridged workspace.

## Passwords

Use a password manager — **1Password** (recommended) or **Bitwarden** (open source). Every bridged account gets a unique, strong password stored in the vault. Never reuse passwords across platforms.

## 2FA

- Enable on every bridged account.
- Prefer authenticator apps or passkeys. Avoid SMS (GitHub is deprecating SMS for sensitive actions).
- Store TOTP backup codes in the password manager. 1Password can store and autofill TOTP codes.
- **Never read a live 2FA code aloud in chat.** Codes stay in the authenticator app.

## OAuth scope awareness

The GitHub \`repo\` scope is coarse: full read-write on every repo the user can touch, not just this one. After connecting, review grants at Settings → Applications → Authorized OAuth Apps and revoke anything unrecognized.

## Revocation paths

- GitHub: Settings → Applications → Authorized OAuth Apps / Installed GitHub Apps
- Grok: grok.com/connectors
- ChatGPT: Settings → Apps & Connectors
- Gemini / Google: myaccount.google.com/permissions
- Claude: Settings → Connectors, plus GitHub installed apps
- GitHub Copilot: GitHub Copilot settings (Microsoft 365 Copilot is not part of this bridge)

Each platform's connector row in the Bridge App stores only status, a reference, and these deep links — never the platform's tokens.

## Rotation

Quarterly: review and revoke OAuth grants, then rotate all connected tokens. Log the date in STATE.md. Tokens persist until manually revoked, so a breach of one platform exposes standing access to everything else.

## Data residency

Connected data can flow into prompts, caches, summaries, and training-adjacent artifacts, sometimes via downstream subprocessors. Mitigations: keep this repo private, put no secrets or personal data in repo files, only references to a vault, prefer connectors with documented retention policies, and audit what each platform has indexed.

## Reporting vulnerabilities

If you find a security issue, open a GitHub issue for the workspace owner rather than posting it publicly. Do not include secrets, tokens, or personal data in any report.
`;
}

export function renderSetupMd(_ctx: TemplateContext): string {
  return `# SETUP.md

> Bridge instructions stored in the repo so the orchestrator is disposable.
> Any AI can read this file and continue the bridge setup. The repo is the source of truth.

## What the orchestrator does

Walks a user through bridging Grok, ChatGPT, Gemini, Claude, and Copilot onto one
shared GitHub repo — connectors, OAuth, scaffold, handoff files, and verification.
The app never proxies chats and never stores AI platform tokens.

## Steps

1. Ask which platforms they want to bridge and whether the repo is new or existing.
2. Guide them to grok.com/connectors, trigger the GitHub OAuth Allow prompt,
   and confirm it landed before moving on.
3. Scaffold the repo: AGENTS.md (standing rules), STATE.md (status snapshot),
   HANDOFF.md (append-only session notes), SECURITY.md, and this SETUP.md.
4. Draft the same connector steps for ChatGPT, Gemini, Claude, and Copilot —
   as a checklist they follow themselves on each platform's site.
5. Push files only after the owner's exact yes. Never store tokens or passwords.

## Platform matrix

- Grok — native connector, full repo read/write, PRs, issues.
- ChatGPT — GitHub app (Settings → Apps & Connectors, not Plugins).
- Gemini — two-way GitHub sync in AI Studio; Drive Projects for Workspace users.
  Gap: Gemini has no real connector catalog; upload-only on web. Fallback: local sync script.
- Claude — official GitHub MCP server (not mcp.github.com) or Claude's GitHub connector.
- Copilot — GitHub Copilot built-in access only. Microsoft 365 Copilot does not count.

## Security

- Private repo only — the single point the owner can audit and delete.
- Secrets boundary — no API keys or personal data in repo files, only references
  to a vault (1Password recommended).
- Token hygiene — after OAuth, walk the owner to Settings > Applications >
  Authorized OAuth Apps. The repo scope is full read-write on every repo they
  can touch, including org repos. Show them how to revoke.
- Quarterly rotation — STATE.md carries the reminder to review and revoke OAuth grants.
- 2FA — authenticator app or passkey; backup codes in the vault, never in chat.
  SMS is being phased out.
- Rate limits — GitHub caps authenticated users at 5,000 requests/hour; secondary
  limits are 80 content-creation requests/minute and 500/hour. Pace calls and
  read the Retry-After header on 429s.
- Data residency — connected data can flow into prompts, caches, and
  training-adjacent artifacts. The repo is the only layer the owner controls.

## Update checks

- On every session start, read this file's version line and compare it to the
  canonical public Bridge template SETUP.md.
- If the template is newer, tell the owner: "A newer bridge template is available.
  Want me to pull the update?" — never auto-apply.
- After pulling an update, note the new version and date in STATE.md.
- Forks stay stable: updates are opt-in, never forced.

## Version

- SETUP.md version: 1.0
- Last updated: 2026-10-09
`;
}

export function renderGeminiSyncScript(ctx: TemplateContext): string {
  return `#!/usr/bin/env node
/**
 * Gemini fallback sync — run locally, never in Bridge App.
 *
 * Pulls README + workspace markdown from GitHub and can push a local file.
 * Put a fine-grained token in GITHUB_TOKEN (vault reference only in repo files).
 *
 *   GITHUB_TOKEN=... node gemini-sync.mjs
 *
 * Repo (baked in): ${ctx.repoOwner}/${ctx.repoName}
 */
const owner = ${JSON.stringify(ctx.repoOwner)};
const repo = ${JSON.stringify(ctx.repoName)};
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("Set GITHUB_TOKEN in your environment (from your vault). Do not commit it.");
  process.exit(1);
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: \`Bearer \${token}\`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "bridge-gemini-sync",
};

async function github(method, path, body) {
  const res = await fetch(\`https://api.github.com\${path}\`, {
    method,
    headers: body ? { ...headers, "Content-Type": "application/json" } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 || (res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0")) {
    const retryAfter = res.headers.get("Retry-After");
    const reset = res.headers.get("X-RateLimit-Reset");
    throw new Error(\`Rate limited. Retry-After=\${retryAfter} X-RateLimit-Reset=\${reset}\`);
  }
  if (!res.ok) throw new Error(\`\${method} \${path} -> \${res.status} \${await res.text()}\`);
  return res.json();
}

const readme = await github("GET", \`/repos/\${owner}/\${repo}/contents/STATE.md\`);
const content = Buffer.from(String(readme.content || "").replace(/\\n/g, ""), "base64").toString("utf8");
console.log("STATE.md (first 500 chars):\\n", content.slice(0, 500));
console.log("\\nGemini web is upload-only. Paste this snapshot into AI Studio or keep using two-way sync.");
`;
}

export type ScaffoldFile = { path: string; content: string };

export function buildWorkspaceFiles(ctx: TemplateContext): ScaffoldFile[] {
  return [
    { path: "AGENTS.md", content: renderAgentsMd(ctx) },
    { path: "STATE.md", content: renderStateMd(ctx) },
    { path: "HANDOFF.md", content: renderHandoffMd(ctx) },
    { path: "SECURITY.md", content: renderSecurityMd(ctx) },
    { path: "SETUP.md", content: renderSetupMd(ctx) },
    { path: "gemini-sync.mjs", content: renderGeminiSyncScript(ctx) },
  ];
}

export function connectedReference(platform: Platform, at: Date): string {
  return connectorNote(platform, at);
}
