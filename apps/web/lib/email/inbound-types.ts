/**
 * Vendor-agnostic inbound email shape.
 *
 * All inbound-email providers (Resend today, Mailgun/Postmark/CloudMailin
 * potentially tomorrow) are normalised into this interface before they hit
 * the rest of the app. Do not leak vendor-specific fields past the adapter
 * layer — if you need a new field, add it here first.
 */
export interface ParsedInboundEmail {
  /** Unique vendor event id — used for idempotency on the UNIQUE resend_email_id column. */
  vendorEventId: string;

  /** RFC 5322 Message-ID of the inbound email (angle-bracketed string). */
  messageId: string | null;
  /** RFC 5322 In-Reply-To header — used to thread replies to sent outreach. */
  inReplyTo: string | null;
  /** RFC 5322 References header, split into an array. */
  references: string[];

  /** Envelope / header "From" */
  fromAddress: string;
  fromName: string | null;

  /**
   * Inbound alias that received this email. Always a single address — if the
   * inbound email was sent to multiple recipients, we create one row per
   * alias recipient that matches one of our users.
   */
  toAddress: string;
  ccAddresses: string[];

  subject: string | null;
  /** First ~280 chars of plain-text body, safe to display as a list preview. */
  preview: string | null;

  hasAttachments: boolean;
  attachmentCount: number;
  /** [{ id, filename, content_type, size_bytes? }] — metadata only, no bytes. */
  attachmentSummary: Array<{
    id: string;
    filename: string | null;
    content_type: string;
    size_bytes?: number;
  }>;

  receivedAt: string; // ISO
  /** Raw vendor webhook payload, stored for debugging and future reprocessing. */
  rawWebhook: unknown;
}

/**
 * Extract the alias token from an inbound address like
 * `abc123def456@inbox.agentrunway.ca` → `abc123def456`.
 *
 * Returns null if the address is not on our inbound domain.
 */
export function extractInboundAlias(address: string): string | null {
  const match = address
    .trim()
    .toLowerCase()
    .match(/^([a-z0-9]+)@inbox\.agentrunway\.ca$/);
  return match ? match[1] : null;
}

/**
 * Given a list of recipient addresses (to + cc), return the first one that
 * matches our inbound domain. This is what we use to resolve → user_id.
 */
export function findInboundRecipient(addresses: string[]): string | null {
  for (const addr of addresses) {
    if (extractInboundAlias(addr)) return addr.trim().toLowerCase();
  }
  return null;
}

/**
 * Build a short plain-text preview from a message body.
 * Strips HTML tags, collapses whitespace, truncates to 280 chars.
 */
export function buildPreview(text: string | null, html: string | null): string | null {
  const source =
    (text && text.trim()) ||
    (html ? html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ") : "");
  if (!source) return null;
  const cleaned = source.replace(/\s+/g, " ").trim();
  return cleaned.length > 280 ? cleaned.slice(0, 277) + "..." : cleaned;
}

/**
 * Parse a raw "References: <a> <b> <c>" header into an array.
 */
export function parseReferences(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("<") && s.endsWith(">"));
}

/**
 * Extract a display name from an RFC 5322 "Name <email>" string.
 * Returns null if no display name is present.
 */
export function extractDisplayName(from: string): string | null {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  if (!match) return null;
  const name = match[1].trim();
  return name.length ? name : null;
}

/**
 * Extract the bare email address from an RFC 5322 "Name <email>" string.
 */
export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}
