export const PLATFORMS = ["grok", "chatgpt", "gemini", "claude", "copilot"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type ConnectorStatus = "pending" | "connected" | "error";

export type RepoMode = "new" | "existing";

export type User = {
  id: string;
  githubId: string | null;
  githubLogin: string | null;
  createdAt: string;
};

export type Workspace = {
  id: string;
  userId: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  visibility: "private";
  createdAt: string;
};

export type Connector = {
  id: string;
  workspaceId: string | null;
  onboardingId: string;
  platform: Platform;
  status: ConnectorStatus;
  lastVerifiedAt: string | null;
  notes: string;
  connectUrl: string;
  revokeUrl: string;
  githubRevokeUrl: string;
};

export type EventRecord = {
  id: string;
  workspaceId: string | null;
  onboardingId: string | null;
  type: "scaffold" | "verify" | "sync" | "rotation" | "onboarding";
  payload: Record<string, unknown>;
  createdAt: string;
};

export type Onboarding = {
  id: string;
  userId: string;
  platforms: Platform[];
  repoMode: RepoMode;
  existingRepo: string | null;
  currentStep: number;
  workspaceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  csrfToken: string;
  userId: string | null;
  githubUserToken: string | null;
  createdAt: number;
};
