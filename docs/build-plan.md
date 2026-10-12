# Bridge App — Build Plan

## Phase 0 — Foundation (week 1)

- [ ] Repo scaffold: README, LICENSE, docs/, .gitignore, basic CI (GitHub Actions: lint + test on PR).
- [ ] Choose stack: React + Vite frontend, Node/Express or Python/FastAPI backend. Decision logged here when made.
- [ ] Set up a GitHub App (not OAuth app) for repo creation. Document the permission set.
- [ ] Basic auth: email/password sign-up, session cookies.

## Phase 1 — Onboarding wizard (weeks 2–3)

- [ ] Step 1: ask which platforms to bridge, new or existing repo.
- [ ] Step 2: Grok connector guide — deep link to grok.com/connectors, OAuth Allow prompt, confirmation check.
- [ ] Step 3: ChatGPT guide — Settings → Apps & Connectors → GitHub app. (Note: path is Apps & Connectors, not Plugins.)
- [ ] Step 4: Gemini guide — AI Studio two-way sync primary, sync-script fallback.
- [ ] Step 5: Claude guide — MCP server config (mcp.github.com is NOT a real address; use the official MCP GitHub server instructions).
- [ ] Step 6: Copilot guide — split into GitHub Copilot (reads repo directly) vs Microsoft 365 Copilot (does not); only GitHub Copilot counts as connected.
- [ ] Progress saved per step so users can resume.

## Phase 2 — Scaffold + verify (week 4)

- [ ] GitHub App creates the private workspace repo with AGENTS.md, STATE.md, HANDOFF.md, SECURITY.md, SETUP.md (version 1.0, matching bridge-bot's canonical).
- [ ] Verification: push a test file (e.g. `bridge-test.md` with a timestamp), then attempt to read it via each platform's API. Report pass/fail per platform.
- [ ] STATE.md updated with connector status table.

## Phase 3 — Dashboard (weeks 5–6)

- [ ] Connector health panel: green/red per platform, last verified timestamp.
- [ ] Repo activity feed: recent commits, who touched what (from git log).
- [ ] Rotation reminder: quarterly token review, surfaced as a dashboard card and optional email.
- [ ] OAuth grant review link: deep link to GitHub Settings → Applications → Authorized OAuth Apps.

## Phase 4 — Sync monitor + Gemini fallback (weeks 7–8)

- [ ] Background job (cron or queue) that polls the workspace repo for new commits and logs them to `events`.
- [ ] Gemini sync script generator: user downloads a small script with their repo URL and vault-reference instructions baked in.
- [ ] Anomaly detection: flag unexpected pushes, force-pushes, or deletions (non-destructive alert only).

## Phase 5 — Polish + launch (weeks 9–10)

- [ ] Landing page with the one-line pitch and a demo video.
- [ ] Docs site: how it works, security model, FAQ.
- [ ] Open-source the app itself (MIT, same as bridge-bot) so the community can self-host.
- [ ] Public launch: post on X, share the bridge-bot template link alongside.

## Open decisions

1. **Stack:** Node or Python for the backend? (Lean Node for GitHub API ecosystem, but Python is fine.)
2. **Hosting:** Vercel/Netlify for frontend + a small VPS or Railway for backend? Or all-in on one platform?
3. **GitHub App vs OAuth:** GitHub App is the right call for repo creation without holding user passwords — confirm before Phase 0 ends.
4. **Multi-repo support:** v1 is one workspace repo per user. Multi-repo (e.g. separate legal and personal bridges) is a v2 feature.
5. **Pricing:** free and open-source to start; paid tier later for hosted dashboard + monitoring?

## Success criteria for v1

- A new user can go from landing page to verified five-platform bridge in under 15 minutes.
- Zero secrets stored by the app.
- Every connector step has a working deep link and a confirmation check.
- Gemini has at least one working path (AI Studio sync or the fallback script).
