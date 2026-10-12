# Platform Matrix — Connector Details

Sourced from bridge-bot's SETUP.md (v1.0) and AGENTS.md. This is the reference the onboarding wizard steps are built from.

| Platform | Connection method | Read/write | Notes | Wizard step |
|----------|------------------|------------|-------|-------------|
| **Grok** | grok.com/connectors → GitHub OAuth | Full (search, read, push, PRs, issues) | Native connector, one tap | 2 |
| **ChatGPT** | Settings → Apps & Connectors → GitHub app | Read and write repos | Path is Apps & Connectors, NOT Plugins | 3 |
| **Gemini** | AI Studio two-way GitHub sync; Drive Projects for Workspace users | Two-way in AI Studio; upload-only on web | No real connector catalog — this is the gap | 4 |
| **Claude** | MCP server (official GitHub MCP) | Repo access via MCP | `mcp.github.com` is NOT a real address — use official MCP instructions | 5 |
| **Copilot** | Built-in GitHub access | Direct repo read | Split into GitHub Copilot vs Microsoft 365 Copilot; only GitHub Copilot counts | 6 |
| **Google Drive** | Native on Grok, ChatGPT, Gemini (strongest on Gemini via Workspace) | Varies | Not a bridge target but a shared data source | — |
| **Notion** | Grok, ChatGPT | Varies | Same | — |
| **Linear** | Grok, ChatGPT | Varies | Same | — |

## Known gotchas (from bridge-bot audit)

1. ChatGPT's path is **Settings → Apps & Connectors**, not Plugins.
2. `mcp.github.com` is not a real address for Claude — use the official MCP GitHub server.
3. Copilot must be split: GitHub Copilot (connected) vs Microsoft 365 Copilot (not connected to the repo).
4. Gemini web is upload-only; AI Studio sync is the real path.
5. The GitHub `repo` OAuth scope is full read-write on every repo the user can touch, including org repos — users must review grants after connecting.
