# Bridge App

A standalone web app that connects Grok, ChatGPT, Gemini, Claude, and Copilot to one shared GitHub workspace.

The bridge was never the bot. It's the repo plus the connectors. The bot was just the guide. Bridge App replaces the guide with a product.

## What it does

1. **Onboard** — walks the user through connecting each platform's GitHub access (Grok connector, ChatGPT GitHub app, Gemini AI Studio sync, Claude MCP server, Copilot built-in).
2. **Scaffold** — creates their private workspace repo with AGENTS.md, STATE.md, HANDOFF.md, and SECURITY.md.
3. **Verify** — pushes a test file and confirms another connected AI can read it.
4. **Monitor** — dashboard showing connector health, last sync, and token rotation reminders *(stub route in this phase)*.

## Why this exists

The public bridge-bot template proved the concept: one private GitHub repo as the single source of truth for cross-AI handoffs. A bot is a guided conversation. An app is a product — onboarding, a dashboard, and a sync layer that keeps the repo current without anyone typing commands.

## Architecture

See [docs/architecture.md](docs/architecture.md).

## Build plan

See [docs/build-plan.md](docs/build-plan.md).

## Security

- Private repo only — the single point the owner can audit and delete.
- No secrets in repo files; references to a vault only (1Password recommended).
- Review OAuth grants after connecting; the `repo` scope is full read-write.
- Quarterly token rotation, logged in STATE.md (including a reminder to review and revoke OAuth grants).
- 2FA via authenticator app or passkey; backup codes in the vault, never in chat.
- Bridge App never stores AI platform tokens. GitHub App credentials are read from environment variables only.
- The app never handles GitHub passwords. Users authorize a GitHub App on GitHub's site.

## Running locally

Prerequisites: **Node.js 20+**.

1. Copy environment names (no values are shipped):

   ```bash
   cp .env.example .env
   ```

2. Leave GitHub App fields empty, or set `GITHUB_STUB=true`. Missing App ID / private key also enables the in-memory GitHub stand-in. This repo does **not** register a GitHub App on any live account.

3. Install, test, and start:

   ```bash
   npm install
   npm test
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000). Use **Local stub sign-in** when running without App credentials.

Useful URLs:

| URL | Purpose |
|-----|---------|
| `GET /health` | Liveness JSON |
| `GET /dashboard` | Dashboard stub |
| `GET /api/platforms` | Connector guides and revoke deep links |
| `POST /api/onboarding/:id/verify` | Push `bridge-test.md` and read it back |

To exercise a real GitHub App later, follow [docs/github-app-setup.md](docs/github-app-setup.md) and set the `GITHUB_*` names from `.env.example`. Put the PEM in `GITHUB_APP_PRIVATE_KEY` (use `\n` for newlines). Never commit `.env` or `*.pem`.

Build the TypeScript output with `npm run build` and run `npm start` against `dist/`.

## License

MIT — see LICENSE.
