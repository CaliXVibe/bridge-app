import { randomUUID } from "node:crypto";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Config } from "./config.js";
import { GitHubApp } from "./github/app.js";
import { GitHubHttp } from "./github/client.js";
import { GitHubRateLimitError } from "./github/rateLimit.js";
import { LiveGitHubRepoClient, StubGitHubRepoClient, type GitHubRepoClient } from "./github/repos.js";
import { githubWebhookHandler } from "./github/webhook.js";
import { PLATFORM_GUIDES } from "./onboarding/platforms.js";
import {
  createOnboarding,
  markConnector,
  parseExistingRepo,
  parsePlatforms,
  parseRepoMode,
  serializeOnboarding,
} from "./onboarding/wizard.js";
import { healthHandler } from "./routes/health.js";
import {
  csrfOk,
  readSignedSessionId,
  sessionCookie,
  SessionStore,
  setCookie,
} from "./session.js";
import { MemoryStore } from "./store.js";
import type { Platform, Session } from "./types.js";
import { PLATFORMS } from "./types.js";
import { scaffoldWorkspace } from "./workspace/scaffolder.js";
import { buildWorkspaceFiles, type TemplateContext } from "./workspace/templates.js";
import { verifyWorkspace } from "./verification/verify.js";

export type AppDeps = {
  config: Config;
  store?: MemoryStore;
  github?: GitHubRepoClient;
  now?: () => Date;
};

declare global {
  namespace Express {
    interface Request {
      session: Session;
    }
  }
}

const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bridge App dashboard (stub)</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="wrap">
    <p><a href="/">← Onboarding</a></p>
    <h1>Dashboard</h1>
    <p>This route is a stub. Connector health, last sync, repo activity, and quarterly rotation reminders ship in the dashboard phase.</p>
    <ul>
      <li>Connector health panel — not built</li>
      <li>Repo activity feed — not built</li>
      <li>Rotation reminder card — not built</li>
    </ul>
    <p>OAuth grant review (deep link, no tokens stored):
      <a href="https://github.com/settings/applications">GitHub Authorized OAuth Apps</a>
    </p>
  </main>
</body>
</html>`;
}

export function createApp(deps: AppDeps) {
  const config = deps.config;
  const store = deps.store ?? new MemoryStore();
  const sessions = new SessionStore(config.sessionSecret);
  const stubGithub = deps.github instanceof StubGitHubRepoClient
    ? deps.github
    : new StubGitHubRepoClient();
  const githubHttp = new GitHubHttp();
  const githubApp = new GitHubApp(config.github, githubHttp);
  const now = deps.now ?? (() => new Date());

  function repoClient(session: Session): GitHubRepoClient {
    if (deps.github) return deps.github;
    if (config.githubStub) return stubGithub;
    return new LiveGitHubRepoClient(githubHttp, async () => {
      if (session.githubUserToken) return session.githubUserToken;
      return githubApp.installationToken();
    });
  }

  const app = express();
  app.disable("x-powered-by");

  app.post(
    "/webhooks/github",
    express.raw({ type: "application/json" }),
    githubWebhookHandler(config.github.webhookSecret),
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(process.cwd(), "public")));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const existingId = readSignedSessionId(req, sessions);
    const session = (existingId && sessions.get(existingId)) || sessions.create();
    sessions.save(session);
    req.session = session;
    const secure = config.appBaseUrl.startsWith("https://");
    setCookie(res, sessionCookie(sessions, session, secure));
    if (!csrfOk(req, session)) {
      res.status(403).json({ error: "csrf token missing or invalid" });
      return;
    }
    next();
  });

  function requireUser(req: Request, res: Response): boolean {
    if (req.session.userId && store.getUser(req.session.userId)) return true;
    res.status(401).json({ error: "sign in with GitHub first" });
    return false;
  }

  app.get("/health", healthHandler);
  app.get("/dashboard", (_req, res) => {
    res.type("html").send(dashboardHtml());
  });

  app.get("/api/session", (req, res) => {
    const user = req.session.userId ? store.getUser(req.session.userId) : undefined;
    res.json({
      csrfToken: req.session.csrfToken,
      stubMode: config.githubStub,
      user: user
        ? { id: user.id, githubLogin: user.githubLogin, githubId: user.githubId }
        : null,
    });
  });

  app.post("/api/session/stub", (req, res) => {
    if (!config.githubStub) {
      res.status(400).json({ error: "stub sign-in is only available when GITHUB_STUB is enabled" });
      return;
    }
    const user = store.createUser({ githubId: "stub", githubLogin: "stub-user" });
    req.session.userId = user.id;
    sessions.save(req.session);
    res.json({ user: { id: user.id, githubLogin: user.githubLogin } });
  });

  app.get("/auth/github", (req, res) => {
    if (config.githubStub || !config.github.clientId) {
      res.status(501).json({
        error: "GitHub App OAuth is stubbed. Register an App, set GITHUB_APP_CLIENT_ID, and disable GITHUB_STUB. See docs/github-app-setup.md.",
      });
      return;
    }
    const state = req.session.csrfToken;
    const redirectUri = `${config.appBaseUrl}/auth/github/callback`;
    res.redirect(githubApp.authorizeUrl(state, redirectUri));
  });

  app.get("/auth/github/callback", async (req, res) => {
    try {
      if (config.githubStub) {
        res.status(501).send("GitHub OAuth is stubbed in this environment.");
        return;
      }
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      if (!code || state !== req.session.csrfToken) {
        res.status(400).send("Invalid OAuth state");
        return;
      }
      const token = await githubApp.exchangeOAuthCode(
        code,
        `${config.appBaseUrl}/auth/github/callback`,
      );
      const profile = await githubApp.getUser(token);
      const existing = store.findUserByGithubId(String(profile.id));
      const user =
        existing ??
        store.createUser({ githubId: String(profile.id), githubLogin: profile.login });
      req.session.userId = user.id;
      req.session.githubUserToken = token;
      sessions.save(req.session);
      res.redirect("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "oauth failed";
      res.status(502).json({ error: message });
    }
  });

  app.get("/api/platforms", (_req, res) => {
    res.json({ platforms: PLATFORM_GUIDES });
  });

  app.post("/api/onboarding", (req, res) => {
    if (!requireUser(req, res)) return;
    try {
      const platforms = parsePlatforms(req.body?.platforms);
      const repoMode = parseRepoMode(req.body?.repoMode);
      const existingRepo = parseExistingRepo(req.body?.existingRepo);
      const row = createOnboarding(store, {
        userId: req.session.userId as string,
        platforms,
        repoMode,
        existingRepo,
      });
      res.status(201).json(serializeOnboarding(store, row));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "invalid onboarding" });
    }
  });

  app.get("/api/onboarding/:id", (req, res) => {
    if (!requireUser(req, res)) return;
    const row = store.getOnboarding(req.params.id);
    if (!row || row.userId !== req.session.userId) {
      res.status(404).json({ error: "onboarding not found" });
      return;
    }
    res.json(serializeOnboarding(store, row));
  });

  app.patch("/api/onboarding/:id", (req, res) => {
    if (!requireUser(req, res)) return;
    const row = store.getOnboarding(req.params.id);
    if (!row || row.userId !== req.session.userId) {
      res.status(404).json({ error: "onboarding not found" });
      return;
    }
    try {
      if (typeof req.body?.currentStep === "number") {
        row.currentStep = req.body.currentStep;
      }
      if (req.body?.platform && req.body?.status) {
        const platform = req.body.platform as Platform;
        if (!PLATFORMS.includes(platform)) throw new Error("unknown platform");
        markConnector(store, row.id, platform, req.body.status, now());
      }
      row.updatedAt = now().toISOString();
      store.saveOnboarding(row);
      res.json(serializeOnboarding(store, row));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "invalid update" });
    }
  });

  app.post("/api/onboarding/:id/workspace", async (req, res) => {
    if (!requireUser(req, res)) return;
    const row = store.getOnboarding(req.params.id);
    if (!row || row.userId !== req.session.userId) {
      res.status(404).json({ error: "onboarding not found" });
      return;
    }
    try {
      const client = repoClient(req.session);
      let owner: string;
      let name: string;
      let htmlUrl: string;

      if (row.repoMode === "existing") {
        const parsed = parseExistingRepo(row.existingRepo);
        if (!parsed) throw new Error("existingRepo is required");
        const [existingOwner, existingName] = parsed.split("/");
        const inspected = await client.inspectRepo({ owner: existingOwner, repo: existingName });
        if (!inspected.private) {
          throw new Error(
            "Refusing to use a non-private repository. Bridge App never changes visibility.",
          );
        }
        owner = inspected.owner;
        name = inspected.name;
        htmlUrl = inspected.htmlUrl;
      } else {
        const requested = typeof req.body?.repoName === "string" ? req.body.repoName : "bridge-workspace";
        if (!REPO_NAME.test(requested)) throw new Error("invalid repo name");
        const created = await client.createPrivateRepo({
          name: requested,
          description: "Private Bridge workspace for cross-AI handoffs.",
        });
        owner = created.owner;
        name = created.name;
        htmlUrl = created.htmlUrl;
      }

      const workspace = store.saveWorkspace({
        id: row.workspaceId ?? randomUUID(),
        userId: row.userId,
        repoOwner: owner,
        repoName: name,
        repoUrl: htmlUrl,
        visibility: "private",
        createdAt: now().toISOString(),
      });
      row.workspaceId = workspace.id;
      row.updatedAt = now().toISOString();
      store.saveOnboarding(row);
      for (const connector of store.listConnectors(row.id)) {
        connector.workspaceId = workspace.id;
        store.saveConnector(connector);
      }
      res.status(201).json({
        workspace: {
          id: workspace.id,
          repoOwner: workspace.repoOwner,
          repoName: workspace.repoName,
          repoUrl: workspace.repoUrl,
          visibility: workspace.visibility,
        },
      });
    } catch (error) {
      sendGitHubError(res, error);
    }
  });

  app.post("/api/onboarding/:id/scaffold", async (req, res) => {
    if (!requireUser(req, res)) return;
    const row = store.getOnboarding(req.params.id);
    if (!row || row.userId !== req.session.userId) {
      res.status(404).json({ error: "onboarding not found" });
      return;
    }
    if (!row.workspaceId) {
      res.status(400).json({ error: "create the workspace repo first" });
      return;
    }
    const workspace = store.getWorkspace(row.workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "workspace not found" });
      return;
    }
    try {
      const ctx = templateContext(row.platforms, store, row.id, workspace, now());
      const files = await scaffoldWorkspace(repoClient(req.session), ctx);
      store.addEvent({
        type: "scaffold",
        workspaceId: workspace.id,
        onboardingId: row.id,
        payload: { files: files.map((f) => f.path) },
      });
      res.json({ ok: true, files: files.map((f) => f.path) });
    } catch (error) {
      sendGitHubError(res, error);
    }
  });

  app.get("/api/onboarding/:id/gemini-sync", (req, res) => {
    if (!requireUser(req, res)) return;
    const row = store.getOnboarding(req.params.id);
    if (!row || row.userId !== req.session.userId) {
      res.status(404).json({ error: "onboarding not found" });
      return;
    }
    const workspace = row.workspaceId ? store.getWorkspace(row.workspaceId) : undefined;
    if (!workspace) {
      res.status(400).json({ error: "create the workspace repo first" });
      return;
    }
    const files = buildWorkspaceFiles(
      templateContext(row.platforms, store, row.id, workspace, now()),
    );
    const script = files.find((f) => f.path === "gemini-sync.mjs");
    res.json({
      filename: "gemini-sync.mjs",
      content: script?.content ?? "",
      note: "Run locally with GITHUB_TOKEN from your vault. Bridge App never stores that token.",
    });
  });

  app.post("/api/onboarding/:id/verify", async (req, res) => {
    if (!requireUser(req, res)) return;
    const row = store.getOnboarding(req.params.id);
    if (!row || row.userId !== req.session.userId) {
      res.status(404).json({ error: "onboarding not found" });
      return;
    }
    const workspace = row.workspaceId ? store.getWorkspace(row.workspaceId) : undefined;
    if (!workspace) {
      res.status(400).json({ error: "create the workspace repo first" });
      return;
    }
    try {
      const result = await verifyWorkspace(repoClient(req.session), {
        owner: workspace.repoOwner,
        repo: workspace.repoName,
        platforms: row.platforms,
        now: now(),
      });
      store.addEvent({
        type: "verify",
        workspaceId: workspace.id,
        onboardingId: row.id,
        payload: { ok: result.ok, path: result.path, timestamp: result.timestamp },
      });
      res.json(result);
    } catch (error) {
      sendGitHubError(res, error);
    }
  });

  return app;
}

function templateContext(
  platforms: Platform[],
  store: MemoryStore,
  onboardingId: string,
  workspace: { repoOwner: string; repoName: string },
  createdAt: Date,
): TemplateContext {
  const connectorStatus: TemplateContext["connectorStatus"] = {};
  for (const connector of store.listConnectors(onboardingId)) {
    connectorStatus[connector.platform] = connector.status;
  }
  return {
    repoOwner: workspace.repoOwner,
    repoName: workspace.repoName,
    createdAt,
    platforms,
    connectorStatus,
  };
}

function sendGitHubError(res: Response, error: unknown): void {
  if (error instanceof GitHubRateLimitError) {
    res.status(429).json({ error: error.message, retryAt: new Date(error.retryAtMs).toISOString() });
    return;
  }
  const message = error instanceof Error ? error.message : "github error";
  res.status(502).json({ error: message });
}
