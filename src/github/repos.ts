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

export class LiveGitHubRepoClient implements GitHubRepoClient {
  constructor(
    private readonly http: GitHubHttp,
    private readonly getToken: () => Promise<string>,
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
    }>("POST", path, token, payload);
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
    const apiPath = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${input.path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;

    let sha: string | undefined;
    try {
      const existing = await this.http.request<{ sha: string }>("GET", apiPath, token);
      sha = existing.sha;
    } catch (error) {
      if (!(error instanceof GitHubHttpError) || error.status !== 404) {
        throw error;
      }
    }

    const result = await this.http.request<{ content: { sha: string } }>("PUT", apiPath, token, {
      message: input.message,
      content: Buffer.from(input.content, "utf8").toString("base64"),
      sha,
    });
    return { sha: result.content.sha };
  }

  async getFile(input: { owner: string; repo: string; path: string }): Promise<RepoFile> {
    const token = await this.getToken();
    const apiPath = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${input.path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
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
