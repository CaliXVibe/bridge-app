import type { GitHubRepoClient } from "../github/repos.js";
import { buildWorkspaceFiles, type TemplateContext, type ScaffoldFile } from "./templates.js";

export async function scaffoldWorkspace(
  client: GitHubRepoClient,
  ctx: TemplateContext,
): Promise<ScaffoldFile[]> {
  const files = buildWorkspaceFiles(ctx);
  for (const file of files) {
    await client.putFile({
      owner: ctx.repoOwner,
      repo: ctx.repoName,
      path: file.path,
      content: file.content,
      message: `Scaffold ${file.path}`,
    });
  }
  return files;
}
