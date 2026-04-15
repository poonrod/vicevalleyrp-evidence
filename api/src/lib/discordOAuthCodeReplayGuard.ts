import { createHmac } from "crypto";
import { env } from "../config/env";

/** Discord (and most OAuth2 providers) issue one-time authorization codes. */
const OAUTH_CODE_REPLAY_TTL_MS = 5 * 60 * 1000;

/** HMAC(code) → expiry timestamp. Never store raw codes or log these keys. */
const claimedCodeHashes = new Map<string, number>();

function pruneExpiredClaims(now: number): void {
  for (const [hash, expiresAt] of claimedCodeHashes) {
    if (expiresAt <= now) claimedCodeHashes.delete(hash);
  }
}

function codeClaimKey(code: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(code).digest("hex");
}

/**
 * One-time callback protection for the same Node process.
 * Call synchronously before `await fetch` so a duplicate HTTP hit cannot race a token exchange.
 *
 * Discord codes are single-use and short-lived; they can be consumed unintentionally by duplicate
 * requests (refresh, prefetch, link scanners, VPN/security tools, extensions), so we avoid a second
 * exchange attempt when this process has already handled the same code.
 */
export function claimDiscordOAuthAuthorizationCode(code: string): "first" | "replay" {
  const now = Date.now();
  pruneExpiredClaims(now);
  const key = codeClaimKey(code);
  const until = claimedCodeHashes.get(key);
  if (until !== undefined && until > now) {
    return "replay";
  }
  claimedCodeHashes.set(key, now + OAUTH_CODE_REPLAY_TTL_MS);
  return "first";
}

/** If token exchange never reached Discord (e.g. network error), allow the same callback URL to be retried. */
export function releaseDiscordOAuthAuthorizationCodeClaim(code: string): void {
  claimedCodeHashes.delete(codeClaimKey(code));
}
