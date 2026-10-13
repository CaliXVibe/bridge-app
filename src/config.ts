export type GitHubAppConfig = {
  appId: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
  slug: string;
  installationId: string;
};

export type Config = {
  port: number;
  sessionSecret: string;
  appBaseUrl: string;
  githubStub: boolean;
  github: GitHubAppConfig;
};

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const appId = env.GITHUB_APP_ID ?? "";
  const privateKey = normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY ?? "");
  const stubFlag = env.GITHUB_STUB === "true";
  const githubStub = stubFlag || !appId || !privateKey;

  const port = Number.parseInt(env.PORT || "3000", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return {
    port,
    sessionSecret: env.SESSION_SECRET || "dev-only-session-secret",
    appBaseUrl: env.APP_BASE_URL || `http://localhost:${port}`,
    githubStub,
    github: {
      appId,
      clientId: env.GITHUB_APP_CLIENT_ID ?? "",
      clientSecret: env.GITHUB_APP_CLIENT_SECRET ?? "",
      privateKey,
      webhookSecret: env.GITHUB_WEBHOOK_SECRET ?? "",
      slug: env.GITHUB_APP_SLUG ?? "",
      installationId: env.GITHUB_INSTALLATION_ID ?? "",
    },
  };
}
