# Bridge App

A standalone web app that connects Grok, ChatGPT, Gemini, Claude, and Copilot to one shared GitHub workspace — without needing Grok Bot.

The bridge was never the bot. It's the repo plus the connectors. The bot was just the guide. Bridge App replaces the guide with a product.

## What it does

1. **Onboard** — walks the user through connecting each platform's GitHub access (Grok connector, ChatGPT GitHub app, Gemini AI Studio sync, Claude MCP server, Copilot built-in).
2. **Scaffold** — creates their private workspace repo with AGENTS.md, STATE.md, HANDOFF.md, and SECURITY.md.
3. **Verify** — pushes a test file and confirms another connected AI can read it.
4. **Monitor** — dashboard showing connector health, last sync, and token rotation reminders.

## Why this exists

Bridge Bot (github.com/CaliXVibe/bridge-bot) proved the concept: one private GitHub repo as the single source of truth for cross-AI handoffs. But a bot is a guided conversation. An app is a product — sign-up, onboarding, a dashboard, and a sync layer that keeps the repo current without anyone typing commands.

## Architecture

See [docs/architecture.md](docs/architecture.md).

## Build plan

See [docs/build-plan.md](docs/build-plan.md).

## Security

- Private repo only — the single point the owner can audit and delete.
- No secrets in repo files; references to a vault only (1Password recommended).
- Review OAuth grants after connecting; the `repo` scope is full read-write.
- Quarterly token rotation, logged in STATE.md.
- 2FA via authenticator app or passkey; backup codes in the vault, never in chat.

## License

MIT — see LICENSE.
