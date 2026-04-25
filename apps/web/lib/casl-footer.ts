// ============================================================================
// lib/casl-footer.ts
// ----------------------------------------------------------------------------
// SCAFFOLDING ONLY — outgoing comms (Gmail / SMTP / SMS) are CASA-shelved as
// of April 2026. See memory/project_google_integrations.md and Cox & Palmer
// review (April 25, 2026) Comment 9: "consider whether the Service can be
// designed to include these elements automatically in any communications
// sent out through the Service."
//
// When outbound messaging ships, every commercial electronic message (CEM)
// generated or sent through Agent Runway MUST call buildCaslFooter() and
// append the result to the message body. CASL §6 requires sender ID +
// physical mailing address + at least one of {phone, email, URL} + a
// functioning unsubscribe mechanism.
//
// Penalty exposure if missing: up to $1,000,000 per violation for individuals,
// $10,000,000 per violation for corporations. See Terms of Service §19.
//
// Until comms ship, this file exists so that:
//   1. Reviewers can see we have a documented plan for CASL automation
//   2. The shape is locked so the Comms champion can't ship without it
//   3. The legal-compliance-champion has a single grep target ("buildCaslFooter")
//      to verify no surface sends without it.
// ============================================================================

export interface CaslSenderProfile {
  /** The agent's display name as registered on their account (CASL §6(2)(a)). */
  senderName:        string;
  /** The brokerage / business name (CASL §6(2)(b) — required when sending on behalf of an entity). */
  businessName:      string | null;
  /** Physical mailing address — must be a real, current address (CASL §6(2)(c)). */
  mailingAddress:    string;
  /** At least ONE of these is required (CASL §6(2)(c)). */
  contactPhone:      string | null;
  contactEmail:      string | null;
  contactWebsite:    string | null;
  /** Per-recipient unsubscribe URL — must be functioning, processed within 10 business days. */
  unsubscribeUrl:    string;
}

/**
 * Build the standard CASL-required footer block for a commercial email.
 *
 * Returns plain text by default. When HTML email shipping is added, expose a
 * second helper `buildCaslFooterHtml()` that wraps the same content in a
 * <table> with the same data hierarchy (most CASL footers in the wild are
 * tables to render reliably across email clients).
 *
 * @throws if any required field is missing (CASL is strict — fail loud, not silent).
 */
export function buildCaslFooter(profile: CaslSenderProfile): string {
  if (!profile.senderName?.trim()) {
    throw new Error("[CASL] senderName is required — cannot send commercial email without sender identification.");
  }
  if (!profile.mailingAddress?.trim()) {
    throw new Error("[CASL] mailingAddress is required — CASL §6(2)(c) requires a physical mailing address in every CEM.");
  }
  if (!profile.contactPhone && !profile.contactEmail && !profile.contactWebsite) {
    throw new Error("[CASL] At least one of contactPhone / contactEmail / contactWebsite is required (CASL §6(2)(c)).");
  }
  if (!profile.unsubscribeUrl?.trim()) {
    throw new Error("[CASL] unsubscribeUrl is required — CASL §6(2)(d) requires a functioning unsubscribe mechanism in every CEM.");
  }

  const senderLine = profile.businessName
    ? `${profile.senderName} on behalf of ${profile.businessName}`
    : profile.senderName;

  const contactLines: string[] = [];
  if (profile.contactPhone)   contactLines.push(`Phone: ${profile.contactPhone}`);
  if (profile.contactEmail)   contactLines.push(`Email: ${profile.contactEmail}`);
  if (profile.contactWebsite) contactLines.push(`Web:   ${profile.contactWebsite}`);

  return [
    "—",
    senderLine,
    profile.mailingAddress,
    contactLines.join(" · "),
    "",
    `To unsubscribe from these emails, visit: ${profile.unsubscribeUrl}`,
    "(Unsubscribe requests are processed within 10 business days, as required by Canada's Anti-Spam Legislation.)",
  ].join("\n");
}

/**
 * Sanity check called from outgoing-message routes BEFORE the message is sent.
 * Returns the sender profile if every required field is present, throws otherwise.
 *
 * Usage (when comms ship):
 *   const profile = assertCaslReady({...senderProfileFromSettings});
 *   const body = userMessage + "\n\n" + buildCaslFooter(profile);
 *   await sendEmail({ ..., body });
 */
export function assertCaslReady(profile: Partial<CaslSenderProfile>): CaslSenderProfile {
  if (!profile.senderName)     throw new Error("[CASL] Cannot send: senderName missing.");
  if (!profile.mailingAddress) throw new Error("[CASL] Cannot send: mailingAddress missing.");
  if (!profile.unsubscribeUrl) throw new Error("[CASL] Cannot send: unsubscribeUrl missing.");
  if (!profile.contactPhone && !profile.contactEmail && !profile.contactWebsite) {
    throw new Error("[CASL] Cannot send: at least one contact channel required.");
  }
  return profile as CaslSenderProfile;
}
