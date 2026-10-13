import { randomUUID } from "node:crypto";
import type { MemoryStore } from "../store.js";
import { PLATFORMS, type Onboarding, type Platform, type RepoMode } from "../types.js";
import { connectorNote, guideFor, PLATFORM_GUIDES } from "./platforms.js";

const STEP_SELECT = 1;

export function wizardSteps(platforms: Platform[]): { step: number; kind: string; platform?: Platform }[] {
  const selected = PLATFORM_GUIDES.filter((g) => platforms.includes(g.id)).sort(
    (a, b) => a.wizardStep - b.wizardStep,
  );
  return [
    { step: STEP_SELECT, kind: "select" },
    ...selected.map((g) => ({ step: g.wizardStep, kind: "platform" as const, platform: g.id })),
    { step: 7, kind: "scaffold" },
    { step: 8, kind: "verify" },
  ];
}

export function parsePlatforms(input: unknown): Platform[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [...PLATFORMS];
  }
  const selected: Platform[] = [];
  for (const item of input) {
    if (typeof item !== "string" || !PLATFORMS.includes(item as Platform)) {
      throw new Error(`Unknown platform: ${String(item)}`);
    }
    if (!selected.includes(item as Platform)) selected.push(item as Platform);
  }
  return selected;
}

export function parseRepoMode(input: unknown): RepoMode {
  if (input === "existing") return "existing";
  return "new";
}

export function parseExistingRepo(input: unknown): string | null {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input !== "string") throw new Error("existingRepo must be owner/name");
  const match = input.trim().match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  if (!match) throw new Error("existingRepo must look like owner/name");
  return `${match[1]}/${match[2]}`;
}

export function createOnboarding(
  store: MemoryStore,
  input: {
    userId: string;
    platforms: Platform[];
    repoMode: RepoMode;
    existingRepo: string | null;
  },
): Onboarding {
  if (input.repoMode === "existing" && !input.existingRepo) {
    throw new Error("existingRepo is required when repoMode is existing");
  }
  const now = new Date().toISOString();
  const row: Onboarding = {
    id: randomUUID(),
    userId: input.userId,
    platforms: input.platforms,
    repoMode: input.repoMode,
    existingRepo: input.existingRepo,
    currentStep: STEP_SELECT,
    workspaceId: null,
    createdAt: now,
    updatedAt: now,
  };
  store.saveOnboarding(row);
  for (const platform of input.platforms) {
    const guide = guideFor(platform);
    store.saveConnector({
      id: randomUUID(),
      workspaceId: null,
      onboardingId: row.id,
      platform,
      status: "pending",
      lastVerifiedAt: null,
      notes: `awaiting ${guide.connectionMethod}`,
      connectUrl: guide.connectUrl,
      revokeUrl: guide.revokeUrl,
      githubRevokeUrl: guide.githubRevokeUrl,
    });
  }
  store.addEvent({
    onboardingId: row.id,
    workspaceId: null,
    type: "onboarding",
    payload: { platforms: input.platforms, repoMode: input.repoMode },
  });
  return row;
}

export function markConnector(
  store: MemoryStore,
  onboardingId: string,
  platform: Platform,
  status: "pending" | "connected" | "error",
  at = new Date(),
) {
  const connectors = store.listConnectors(onboardingId);
  const row = connectors.find((c) => c.platform === platform);
  if (!row) throw new Error(`Platform ${platform} is not part of this onboarding`);
  row.status = status;
  if (status === "connected") {
    row.notes = connectorNote(platform, at);
    row.lastVerifiedAt = at.toISOString();
  }
  store.saveConnector(row);
  return row;
}

export function serializeOnboarding(store: MemoryStore, row: Onboarding) {
  return {
    id: row.id,
    currentStep: row.currentStep,
    platforms: row.platforms,
    repoMode: row.repoMode,
    existingRepo: row.existingRepo,
    workspaceId: row.workspaceId,
    steps: wizardSteps(row.platforms),
    connectors: store.listConnectors(row.id).map((c) => ({
      platform: c.platform,
      status: c.status,
      notes: c.notes,
      connectUrl: c.connectUrl,
      revokeUrl: c.revokeUrl,
      githubRevokeUrl: c.githubRevokeUrl,
      lastVerifiedAt: c.lastVerifiedAt,
    })),
  };
}
