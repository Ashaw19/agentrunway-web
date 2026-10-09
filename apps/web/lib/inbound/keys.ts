/**
 * Website inbound keys (00173). A key lets one website POST events into one
 * Agent Runway account, and nothing else: it can't read anything back.
 *
 * Only the sha256 is stored. The key is shown once, when it is made, so a
 * database leak doesn't hand out working keys.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX = "arw_site_";

export function generateInboundKey(): { key: string; prefix: string; hash: string } {
  const key = PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: key.slice(0, PREFIX.length + 6), hash: hashInboundKey(key) };
}

export function hashInboundKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** "Bearer arw_site_…" → the key, or null for anything that isn't one. */
export function keyFromAuthHeader(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!m || !m[1].startsWith(PREFIX) || m[1].length < PREFIX.length + 40 || m[1].length > 200) return null;
  return m[1];
}

/** Constant-time compare of two hex hashes (belt and braces; lookup is by hash). */
export function sameHash(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
