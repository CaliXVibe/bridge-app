import type { Request, Response } from "express";
import { verifyWebhookSignature } from "./app.js";

export function githubWebhookHandler(secret: string) {
  return (req: Request, res: Response): void => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    const signature = req.header("x-hub-signature-256") || undefined;
    if (secret && !verifyWebhookSignature(raw, signature, secret)) {
      res.status(401).json({ error: "invalid webhook signature" });
      return;
    }
    const event = req.header("x-github-event") || "unknown";
    // Delivery is accepted but not acted on in this phase (no visibility changes, no live App registration).
    res.status(200).json({ ok: true, event, handled: event === "ping" ? "pong" : "stub" });
  };
}
