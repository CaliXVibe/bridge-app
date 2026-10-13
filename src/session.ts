import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Session } from "./types.js";

const COOKIE_NAME = "bridge_sid";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class SessionStore {
  private sessions = new Map<string, Session>();

  constructor(private readonly secret: string) {}

  create(partial: Partial<Session> = {}): Session {
    const session: Session = {
      id: randomBytes(16).toString("hex"),
      csrfToken: randomBytes(16).toString("hex"),
      userId: partial.userId ?? null,
      githubUserToken: partial.githubUserToken ?? null,
      createdAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (Date.now() - session.createdAt > MAX_AGE_MS) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  save(session: Session): void {
    this.sessions.set(session.id, session);
  }

  sign(id: string): string {
    const mac = createHmac("sha256", this.secret).update(id).digest("hex");
    return `${id}.${mac}`;
  }

  unsign(value: string | undefined): string | null {
    if (!value || !value.includes(".")) return null;
    const splitAt = value.lastIndexOf(".");
    const id = value.slice(0, splitAt);
    const mac = value.slice(splitAt + 1);
    const expected = createHmac("sha256", this.secret).update(id).digest("hex");
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
    return id;
  }
}

export function readSignedSessionId(
  req: IncomingMessage,
  store: SessionStore,
): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const cookies = parseCookie(header);
  return store.unsign(cookies[COOKIE_NAME]);
}

export function sessionCookie(
  store: SessionStore,
  session: Session,
  secure: boolean,
): string {
  return serializeCookie(COOKIE_NAME, store.sign(session.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: MAX_AGE_MS / 1000,
  });
}

export function csrfOk(req: IncomingMessage, session: Session): boolean {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const header = req.headers["x-csrf-token"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(session.csrfToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function setCookie(res: ServerResponse, cookie: string): void {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  const list = Array.isArray(current) ? current : [String(current)];
  res.setHeader("Set-Cookie", [...list, cookie]);
}
