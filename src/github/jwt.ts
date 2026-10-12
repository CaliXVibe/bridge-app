import { createSign } from "node:crypto";

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * GitHub App JWT (RS256). `iss` is the numeric App ID (or client ID).
 * iat is set 60s in the past for clock drift; exp is 10 minutes out.
 */
export function createAppJwt(
  appId: string,
  privateKey: string,
  nowMs: number = Date.now(),
): string {
  if (!appId) throw new Error("GitHub App ID is not configured");
  if (!privateKey) throw new Error("GitHub App private key is not configured");

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const iat = Math.floor(nowMs / 1000) - 60;
  const exp = Math.floor(nowMs / 1000) + 10 * 60;
  const payload = base64url(JSON.stringify({ iat, exp, iss: appId }));
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  const signature = signer.sign(privateKey, "base64url");
  return `${data}.${signature}`;
}
