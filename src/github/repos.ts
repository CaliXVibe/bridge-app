import { GitHubHttp, GitHubHttpError } from "./client.js";

export type CreatedRepo = {
  owner: string;
  name: string;
  htmlUrl: string;
  private: true;
};

export type RepoFile = {
  path: string;
  content: string;
  sha: string;
};

export interface GitHubRepoClient {
  inspectRepo(input: { owner: string; repo: string }): Promise<{
    owner: string;
    name: string;
    htmlUrl: string;
    private: boolean;
  }>;
  createPrivateRepo(input: {
    name: string;
    description?: string;
    org?: string;
  }): Promise<CreatedRepo>;
  putFile(input: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
  }): Promise<{ sha: string }>;
  getFile(input: { owner: string; repo: string; path: string }): Promise<RepoFile>;
}

function assertPrivate(repo: { private?: boolean; html_url?: string; full_name?: string }): void {
  if (repo.private !== true) {
    throw new Error(
      "Refusing to use a non-private repository. Bridge App never changes visibility; create a private repo instead.",
    );
  }
}

/** Rejects paths GitHub would refuse or that try to escape the repo root. */
export function encodeRepoPath(path: string): string {
  if (typeof path !== "string" || !path) throw new Error("file path is required");
  if (path.startsWith("/")) throw new Error("file path must not start with a slash");
  const parts = path.split("/");
  for (const part of parts) {
    if (!part || part === "." || part === "..") {
      throw new Error(`invalid file path: ${JSON.stringify(path)}`);
    }
  }
  return parts.map(encodeURIComponent).join("/");
}

function isWriteConflict(error: unknown): boolean {
  if (!(error instanceof GitHubHttpError)) return false;
  if (error.status === 409) return true;
  // 422 when a sha is required/stale because the file changed between GET and PUT.
  return error.status === 422 && /sha/i.test(error.body);
}

// GitHub serializes Contents API commits per branch; queue writes per repo in-process
// so concurrent verify/scaffold calls don't race each other into 409s.
const writeQueues = new Map<string, Promise<unknown>>();
function enqueueWrite<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  writeQueues.set(key, next);
  void next.finally(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  }).catch(() => undefined);
  return next;
}

export type LiveRepoClientOptions = {
  conflictRetries?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class LiveGitHubRepoClient implements GitHubRepoClient {
  constructor(
    private readonly http: GitHubHttp,
    private readonly getToken: () => Promise<string>,
    private readonly options: LiveRepoClientOptions = {},
  ) {}

  async inspectRepo(input: { owner: string; repo: string }): Promise<{
    owner: string;
    name: string;
    htmlUrl: string;
    private: boolean;
  }> {
    const token = await this.getToken();
    const repo = await this.http.request<{
      private: boolean;
      html_url: string;
      name: string;
      owner: { login: string };
    }>("GET", `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`, token);
    return {
      owner: repo.owner.login,
      name: repo.name,
      htmlUrl: repo.html_url,
      private: repo.private === true,
    };
  }

  async createPrivateRepo(input: {
    name: string;
    description?: string;
    org?: string;
  }): Promise<CreatedRepo> {
    const token = await this.getToken();
    const path = input.org ? `/orgs/${encodeURIComponent(input.org)}/repos` : "/user/repos";
    const payload = {
      name: input.name,
      description: input.description,
      private: true as const,
      auto_init: true,
    };
    const repo = await this.http.request<{
      private: boolean;
      html_url: string;
      name: string;
      owner: { login: string };
    }>("POST", path, token, payload).catch((error: unknown) => {
      if (error instanceof GitHubHttpError && (error.status === 403 || error.status === 404)) {
        throw new Error(
          `GitHub refused to create the repository (${error.status}). A GitHub App installation token cannot create repositories for a personal account; sign in with GitHub (user token) or create the private repo yourself and choose "use existing repo".`,
        );
      }
      throw error;
    });
    assertPrivate(repo);
    return {
      owner: repo.owner.login,
      name: repo.name,
      htmlUrl: repo.html_url,
      private: true,
    };
  }

  async putFile(input: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
  }): Promise<{ sha: string }> {
    const token = await this.getToken();
    const apiPath = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${encodeRepoPath(input.path)}`;

    return enqueueWrite(`${input.owner}/${input.repo}`.toLowerCase(), () => this.putFileOnce(apiPath, token, input));
  }

  private async putFileOnce(
    apiPath: string,
    token: string,
    input: { content: string; message: string },
  ): Promise<{ sha: string }> {
    const retries = this.options.conflictRetries ?? 4;
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let attempt = 0; ; attempt += 1) {
      let sha: string | undefined;
      try {
        const existing = await this.http.request<{ sha: string }>("GET", apiPath, token);
        sha = existing.sha;
      } catch (error) {
        if (!(error instanceof GitHubHttpError) || error.status !== 404) {
          throw error;
        }
      }
      try {
        const result = await this.http.request<{ content: { sha: string } }>("PUT", apiPath, token, {
          message: input.message,
          content: Buffer.from(input.content, "utf8").toString("base64"),
          sha,
        });
        return { sha: result.content.sha };
      } catch (error) {
        if (!isWriteConflict(error) || attempt >= retries) throw error;
        // Concurrent commits move the branch head; re-read sha and retry with jittered backoff.
        await sleep(250 * 2 ** attempt + Math.floor(Math.random() * 250));
      }
    }
  }

  async getFile(input: { owner: string; repo: string; path: string }): Promise<RepoFile> {
    const token = await this.getToken();
    const apiPath = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${encodeRepoPath(input.path)}`;
    const result = await this.http.request<{ content: string; encoding: string; sha: string; path: string }>(
      "GET",
      apiPath,
      token,
    );
    const encoded = (result.content || "").replace(/\n/g, "");
    const content = Buffer.from(encoded, "base64").toString("utf8");
    return { path: result.path, content, sha: result.sha };
  }
}

export class StubGitHubRepoClient implements GitHubRepoClient {
  readonly files = new Map<string, { content: string; sha: string }>();
  readonly repos = new Map<string, CreatedRepo>();
  defaultOwner: string;

  constructor(defaultOwner = "stub-user") {
    this.defaultOwner = defaultOwner;
  }

  private key(owner: string, repo: string, path: string): string {
    return `${owner}/${repo}:${path}`;
  }

  async inspectRepo(input: { owner: string; repo: string }): Promise<{
    owner: string;
    name: string;
    htmlUrl: string;
    private: boolean;
  }> {
    const found = this.repos.get(`${input.owner}/${input.repo}`);
    if (found) {
      return { owner: found.owner, name: found.name, htmlUrl: found.htmlUrl, private: true };
    }
    return {
      owner: input.owner,
      name: input.repo,
      htmlUrl: `https://github.com/${input.owner}/${input.repo}`,
      private: true,
    };
  }

  async createPrivateRepo(input: {
    name: string;
    description?: string;
    org?: string;
  }): Promise<CreatedRepo> {
    const owner = input.org || this.defaultOwner;
    const created: CreatedRepo = {
      owner,
      name: input.name,
      htmlUrl: `https://github.com/${owner}/${input.name}`,
      private: true,
    };
    this.repos.set(`${owner}/${input.name}`, created);
    await this.putFile({
      owner,
      repo: input.name,
      path: "README.md",
      content: `# ${input.name}\n\n${input.description ?? "Private Bridge workspace."}\n`,
      message: "Initial commit",
    });
    return created;
  }

  async putFile(input: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
  }): Promise<{ sha: string }> {
    const sha = Buffer.from(`${input.path}:${input.content}:${input.message}`).toString("hex").slice(0, 40);
    this.files.set(this.key(input.owner, input.repo, input.path), { content: input.content, sha });
    return { sha };
  }

  async getFile(input: { owner: string; repo: string; path: string }): Promise<RepoFile> {
    const found = this.files.get(this.key(input.owner, input.repo, input.path));
    if (!found) {
      throw new GitHubHttpError(404, "Not Found", "GET", input.path);
    }
    return { path: input.path, content: found.content, sha: found.sha };
  }
}
