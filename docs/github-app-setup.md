# GitHub App setup (operator, not automated)

This repository does **not** register a GitHub App on any live account. Create
the App yourself in GitHub, then put its credentials in environment variables.
Never commit the private key, client secret, or webhook secret.

## Create the App

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
2. Set a homepage URL and callback URL to your deployed or local origin:
   - Callback: `{APP_BASE_URL}/auth/github/callback`
   - Webhook: `{APP_BASE_URL}/webhooks/github`
3. Generate a private key and store it in a vault. Paste it into
   `GITHUB_APP_PRIVATE_KEY` (use `\n` for newlines in a single-line env var).
4. Copy the App ID, client ID, client secret, webhook secret, and slug into the
   matching `GITHUB_*` variables listed in `.env.example`.

## Permission set

Minimum permissions for private workspace creation and file write:

| Permission | Access | Why |
|------------|--------|-----|
| Administration | Read and write | Create a new private repository on the installation account |
| Contents | Read and write | Scaffold files and the verification test file |
| Metadata | Read | Required for repository APIs |

Do **not** request org administration, user email, or anything beyond repo
create + content read/write on repos the App creates.

Where GitHub offers a repository access choice, prefer **only repositories the
App creates** (or a single selected workspace), not all repositories.

## User authorization (no passwords)

The App never asks for a GitHub password. Users install the App and/or complete
the GitHub App user-to-server OAuth flow on GitHub's site. Bridge App reads
only:

- App ID + private key (to mint short-lived JWTs and installation tokens)
- Optional user-to-server OAuth tokens (session memory only, never disk)
- Webhook secret (to verify GitHub signed payloads)

Personal access tokens are not part of the happy path. If a user runs the
Gemini fallback sync script locally, that script reads `GITHUB_TOKEN` from
**their** environment — Bridge App never sees it.

## What this App must never do

- Change repository visibility (workspaces are created `private: true` and left
  that way).
- Store AI platform tokens (Grok, ChatGPT, Gemini, Claude, Copilot).
- Create, publish, or deploy a GitHub App registration as part of `npm start`.
