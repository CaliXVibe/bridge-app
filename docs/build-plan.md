# Bridge App — Build Plan

## Stack decision (Phase 0)

**Logged:** Node.js 20+ with TypeScript, Express backend, in-memory store for
local Phase 1. Frontend for this phase is static HTML served by Express
(`/`, `/dashboard` stub). React + Vite from the architecture doc is deferred
until the dashboard phase so the orchestrator can ship without a second
build pipeline.

GitHub App (not an OAuth-only app, not a personal token) is confirmed for
repo creation. Credentials are env-only. Email/password sign-up from the
original Phase 0 list is **not** implemented: the architecture's security
model and operator instructions forbid handling user passwords. Sign-in is
GitHub App OAuth (stubbed when credentials are absent).

## Phase 0 — Foundation

- [x] Repo scaffold: README, LICENSE, docs/, .gitignore, basic CI (GitHub Actions: lint + test on PR).
- [x] Choose stack: React + Vite frontend, Node/Express or Python/FastAPI backend. Decision logged here when made.
- [x] Set up a GitHub App (not OAuth app) for repo creation. Document the permission set.
- [ ] Basic auth: email/password sign-up, session cookies. *(Deferred / replaced by GitHub App OAuth; see stack decision.)*

## Phase 1 — Onboarding wizard

- [x] Step 1: ask which platforms to bridge, new or existing repo.
- [x] Step 2: Grok connector guide — deep link to grok.com/connectors, OAuth Allow prompt, confirmation check.
- [x] Step 3: ChatGPT guide — Settings → Apps & Connectors → GitHub app. (Note: path is Apps & Connectors, not Plugins.)
- [x] Step 4: Gemini guide — AI Studio two-way sync primary, sync-script fallback.
- [x] Step 5: Claude guide — MCP server config (mcp.github.com is NOT a real address; use the official MCP GitHub server instructions).
- [x] Step 6: Copilot guide — split into GitHub Copilot (reads repo directly) vs Microsoft 365 Copilot (does not); only GitHub Copilot counts as connected.
- [x] Progress saved per step so users can resume.

## Phase 2 — Scaffold + verify

- [x] GitHub App creates the private workspace repo with AGENTS.md, STATE.md, HANDOFF.md, SECURITY.md, SETUP.md (version 1.0, matching bridge-bot's canonical).
- [x] Verification: push a test file (e.g. `bridge-test.md` with a timestamp), then attempt to read it via each platform's API. Report pass/fail per platform.
- [ ] STATE.md updated with connector status table. *(Scaffolder writes the table; live rewrite after verify is a follow-up.)*

Note on "read it via each platform's API": the architecture forbids storing AI
platform tokens, so Phase 1 verifies by reading the file back **through GitHub**
and returning per-platform instructions for a human (or the other AI) to
confirm. Direct platform API read-back is stubbed.

## Phase 3 — Dashboard (weeks 5–6)

- [ ] Connector health panel: green/red per platform, last verified timestamp.
- [ ] Repo activity feed: recent commits, who touched what (from git log).
- [ ] Rotation reminder: quarterly token review, surfaced as a dashboard card and optional email.
- [ ] OAuth grant review link: deep link to GitHub Settings → Applications → Authorized OAuth Apps.

`GET /dashboard` is a stub in this phase.

## Phase 4 — Sync monitor + Gemini fallback (weeks 7–8)

- [ ] Background job (cron or queue) that polls the workspace repo for new commits and logs them to `events`.
- [x] Gemini sync script generator: user downloads a small script with their repo URL and vault-reference instructions baked in. *(Generator ships; scheduled runner is Phase 4.)*
- [ ] Anomaly detection: flag unexpected pushes, force-pushes, or deletions (non-destructive alert only).

## Phase 5 — Polish + launch (weeks 9–10)

- [ ] Landing page with the one-line pitch and a demo video.
- [ ] Docs site: how it works, security model, FAQ.
- [ ] Open-source the app itself (MIT, same as bridge-bot) so the community can self-host.
- [ ] Public launch: post on X, share the bridge-bot template link alongside.

## Open decisions

1. **Stack:** Node or Python for the backend? **Decision: Node.js + TypeScript + Express.**
2. **Hosting:** Vercel/Netlify for frontend + a small VPS or Railway for backend? Or all-in on one platform?
3. **GitHub App vs OAuth:** GitHub App is the right call for repo creation without holding user passwords — confirm before Phase 0 ends. **Confirmed.**
4. **Multi-repo support:** v1 is one workspace repo per user. Multi-repo (e.g. separate legal and personal bridges) is a v2 feature.
5. **Pricing:** free and open-source to start; paid tier later for hosted dashboard + monitoring?

## Success criteria for v1

- A new user can go from landing page to verified five-platform bridge in under 15 minutes.
- Zero secrets stored by the app.
- Every connector step has a working deep link and a confirmation check.
- Gemini has at least one working path (AI Studio sync or the fallback script).
