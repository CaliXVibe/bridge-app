# Bridge App — Architecture

## Core principle

The bridge is the **repo + connectors**. The app is the guide, the dashboard, and the sync layer. Nothing in the app stores AI platform credentials — it only orchestrates OAuth flows that the user completes on each platform's own site.

## Components

### 1. Web frontend (React + Vite)

- Landing page explaining the concept (one repo, five AIs).
- Sign-up / sign-in (email + password, or GitHub OAuth).
- Onboarding wizard: step-by-step connector setup for each platform.
- Dashboard: connector status, last sync time, repo health, rotation reminders.
- Settings: repo visibility, vault references, notification preferences.

### 2. Backend (Node.js + Express, or Python + FastAPI)

- **Auth service** — user accounts, session management.
- **GitHub service** — creates the user's private workspace repo via GitHub API (using a GitHub App installation, not a personal token, so the app never holds the user's password).
- **Connector guide service** — generates platform-specific setup instructions (deep links into grok.com/connectors, ChatGPT Apps & Connectors, Gemini AI Studio, Claude MCP config, Copilot).
- **Verification service** — pushes a test file to the user's repo, then checks that each connected platform can read it (via each platform's API where available).
- **Sync monitor** — polls the repo for changes, logs them, surfaces anomalies.

### 3. Data model

- `users` — id, email, github_id, created_at.
- `workspaces` — id, user_id, repo_owner, repo_name, repo_url, visibility, created_at.
- `connectors` — id, workspace_id, platform (grok|chatgpt|gemini|claude|copilot), status (pending|connected|error), last_verified_at, notes.
- `events` — id, workspace_id, type (scaffold|verify|sync|rotation), payload, created_at.

### 4. The Gemini problem

Gemini has no real connector catalog. On web it's upload-only; in AI Studio it has two-way GitHub sync. The app needs a fallback path:

- **Primary:** guide the user to enable AI Studio's two-way GitHub sync on their workspace repo.
- **Fallback:** a small sync script (Node or Python) the user runs locally or on a schedule (cron / GitHub Actions) that pulls from and pushes to the repo. The app generates this script with the user's repo URL baked in.
- **Future:** if Google ships MCP support for Gemini, swap the fallback for a native connector.

### 5. Security model

- The app uses a **GitHub App** (not OAuth personal tokens) so it can create repos on the user's behalf without ever seeing their password. The GitHub App's permissions are scoped to repo creation + content read/write on repos it creates.
- User OAuth tokens for each AI platform are **never stored**. The app only stores references ("connected via grok.com/connectors on 2026-10-12") and deep links to the revocation page.
- All repo files follow the no-secrets rule from bridge-bot's AGENTS.md: references to a vault (1Password/Bitwarden) only.
- The app itself runs over HTTPS with standard session security (httpOnly cookies, CSRF tokens).

### 6. What the app does NOT do

- It does not proxy AI conversations. Each AI talks to GitHub directly.
- It does not store prompts, responses, or any AI-generated content.
- It does not send email or post to X on the user's behalf without explicit action.
- It does not auto-apply template updates — forks stay stable, updates are opt-in.

## Data flow

```
User → Bridge App (onboard) → GitHub App creates private repo
User → each AI platform (OAuth, done on platform's site) → repo connected
Bridge App → pushes test file → each AI reads it → verification passes
Each AI → reads/writes repo directly (app just monitors)
```

The app is the **orchestrator**, not the middleman. Once connected, the AIs talk to GitHub on their own.
