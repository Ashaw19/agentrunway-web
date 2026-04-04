/**
 * SSRF Protection Helpers
 *
 * Shared module for validating that hostnames/IPs do not resolve to
 * private or internal network addresses. Used by SMTP connection routes
 * and the email sender to prevent Server-Side Request Forgery attacks.
 *
 * Checks both IPv4 and IPv6 addresses, including IPv4-mapped IPv6.
 * Performs DNS resolution (A + AAAA records) at validation time to
 * defend against DNS rebinding attacks.
 */

import dns from "dns/promises";

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 10) return true;                          // 10.0.0.0/8
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;  // 172.16.0.0/12
  if (parts[0] === 192 && parts[1] === 168) return true;    // 192.168.0.0/16
  if (parts[0] === 127) return true;                          // 127.0.0.0/8
  if (parts[0] === 169 && parts[1] === 254) return true;    // 169.254.0.0/16 link-local
  if (parts[0] === 0) return true;                            // 0.0.0.0/8
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;             // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique-local
  if (normalized === "::ffff:127.0.0.1") return true;         // IPv4-mapped loopback
  const v4Mapped = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]);
  return false;
}

/**
 * Check if a hostname resolves to a private/internal IP address.
 * Returns true if the host should be BLOCKED (is private/internal).
 * Resolves DNS at call time to prevent DNS rebinding attacks.
 */
export async function isPrivateHost(host: string): Promise<boolean> {
  const lower = host.toLowerCase().trim();
  if (lower === "localhost" || lower === "0.0.0.0" || lower === "[::]" || lower === "::1") return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  // Direct IPv4 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return isPrivateIPv4(lower);
  // Direct IPv6 literal
  if (lower.includes(":")) return isPrivateIPv6(lower);
  // Resolve DNS and check both A and AAAA records
  try {
    const [v4Addrs, v6Addrs] = await Promise.all([
      dns.resolve4(host).catch(() => [] as string[]),
      dns.resolve6(host).catch(() => [] as string[]),
    ]);
    if (v4Addrs.length === 0 && v6Addrs.length === 0) return true; // can't resolve = block
    if (v4Addrs.some(isPrivateIPv4)) return true;
    if (v6Addrs.some(isPrivateIPv6)) return true;
    return false;
  } catch {
    return true; // If we can't resolve, block it
  }
}
