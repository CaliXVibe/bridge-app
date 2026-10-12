import { randomUUID } from "node:crypto";
import type {
  Connector,
  EventRecord,
  Onboarding,
  User,
  Workspace,
} from "./types.js";

export class MemoryStore {
  users = new Map<string, User>();
  workspaces = new Map<string, Workspace>();
  connectors = new Map<string, Connector>();
  events = new Map<string, EventRecord>();
  onboardings = new Map<string, Onboarding>();

  createUser(partial: Omit<User, "id" | "createdAt"> & { id?: string }): User {
    const user: User = {
      id: partial.id ?? randomUUID(),
      githubId: partial.githubId,
      githubLogin: partial.githubLogin,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  findUserByGithubId(githubId: string): User | undefined {
    for (const user of this.users.values()) {
      if (user.githubId === githubId) return user;
    }
    return undefined;
  }

  saveOnboarding(row: Onboarding): Onboarding {
    this.onboardings.set(row.id, row);
    return row;
  }

  getOnboarding(id: string): Onboarding | undefined {
    return this.onboardings.get(id);
  }

  saveWorkspace(row: Workspace): Workspace {
    this.workspaces.set(row.id, row);
    return row;
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  saveConnector(row: Connector): Connector {
    this.connectors.set(row.id, row);
    return row;
  }

  listConnectors(onboardingId: string): Connector[] {
    return [...this.connectors.values()].filter((c) => c.onboardingId === onboardingId);
  }

  addEvent(row: Omit<EventRecord, "id" | "createdAt"> & { id?: string }): EventRecord {
    const event: EventRecord = {
      id: row.id ?? randomUUID(),
      workspaceId: row.workspaceId,
      onboardingId: row.onboardingId,
      type: row.type,
      payload: row.payload,
      createdAt: new Date().toISOString(),
    };
    this.events.set(event.id, event);
    return event;
  }
}
