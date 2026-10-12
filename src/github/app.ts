import { createHmac, timingSafeEqual } from "node:crypto";
import type { GitHubAppConfig } from "../config.js";
import { GitHubHttp } from "./client.js";
import { createAppJwt } from "./jwt.js";

export type GitHubUserProfile = {
  id: number;
  login: string;
};

export class GitHubApp {
  constructor(
    private readonly config: GitHubAppConfig,
    private readonly http: GitHubHttp,
    private readonly now: () => number = Date.now,
  ) {}

  appJwt(): string {
    return createAppJwt(this.config.appId, this.config.privateKey, this.now());
  }

  async installationToken(installationId = this.config.installationId): Promise<string> {
    if (!installationId) {
      throw new Error("GitHub App installation ID is not configured");
    }
    const jwt = this.appJwt();
    const result = await this.http.request<{ token: string }>(
      "POST",
      `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      jwt,
      {},
    );
    return result.token;
  }

  authorizeUrl(state: string, redirectUri: string): string {
    if (!this.config.clientId) {
      throw new Error("GitHub App client ID is not configured");
    }
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeOAuthCode(code: string, redirectUri: string): Promise<string> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("GitHub App OAuth client credentials are not configured");
    }
    const result = await this.http.request<{ access_token?: string; error?: string }>(
      "POST",
      "https://github.com/login/oauth/access_token",
      "",
      {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: redirectUri,
      },
      { Accept: "application/json" },
    );
    if (!result.access_token) {
      throw new Error(result.error || "GitHub OAuth exchange failed");
    }
    return result.access_token;
  }

  async getUser(userToken: string): Promise<GitHubUserProfile> {
    return this.http.request<GitHubUserProfile>("GET", "/user", userToken);
  }
}

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!secret || !signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
