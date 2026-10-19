/**
 * consent-gate: the send-time check (today AND the send day) and a consent
 * request's sender identification (SOR/2012-36 s.2, s.4), with the short
 * label Flight Control shows for whatever is missing.
 */
import { describe, expect, it } from "vitest";
import {
  CONSENT_SENDER_GAP_LABEL,
  consentBlockReasonNowAndOnSendDay,
  consentRequestEmailFooter,
  consentRequestTextSignOff,
} from "../consent-gate";

const TODAY = "2026-10-06";

describe("consentBlockReasonNowAndOnSendDay", () => {
  const lapsesOct20 = { client: {}, closedDeals: [{ close_date: "2024-10-20" }], consents: [] };

  it("allows a message consent covers today and on its send day", () => {
    expect(consentBlockReasonNowAndOnSendDay(lapsesOct20, "email", "2026-10-10", "Sam", TODAY)).toBeNull();
  });

  it("refuses a message whose send day falls after the lapse, though today is fine", () => {
    expect(consentBlockReasonNowAndOnSendDay(lapsesOct20, "email", "2026-10-25", "Sam", TODAY)).toMatch(/CASL/);
  });

  it("refuses a message with a past trigger date when consent has since lapsed", () => {
    expect(consentBlockReasonNowAndOnSendDay(lapsesOct20, "sms", "2026-10-01", "Sam", "2026-10-21")).toMatch(/CASL/);
  });

  it("refuses an unsubscribed client whatever the dates", () => {
    const optedOut = { client: { email_opt_out_at: "2026-10-01T12:00:00Z" }, closedDeals: [], consents: [] };
    expect(consentBlockReasonNowAndOnSendDay(optedOut, "email", "2026-10-10", "Sam", TODAY)).toMatch(/unsubscribed/);
  });
});

describe("consentRequestEmailFooter", () => {
  const full = { displayName: "Andrew Shaw", brokerage: "REAL Broker", phone: "506-555-0100", mailingAddress: "123 Main St, Saint John NB E2L 1A1" };

  it("builds name, mailing address, contact, then the withdrawal and unsubscribe line", () => {
    const out = consentRequestEmailFooter(full);
    expect(out.ok && out.footer).toMatch(/^Andrew Shaw, REAL Broker\n123 Main St, Saint John NB E2L 1A1\n506-555-0100\n\nYou can say no/);
  });

  it("says which piece is missing, with a label to match", () => {
    const noAddress = consentRequestEmailFooter({ ...full, mailingAddress: null });
    const noContact = consentRequestEmailFooter({ ...full, phone: null });
    const noName = consentRequestEmailFooter({ ...full, displayName: null, brokerage: null });
    expect(noAddress).toMatchObject({ ok: false, missing: "address" });
    expect(noContact).toMatchObject({ ok: false, missing: "contact" });
    expect(noName).toMatchObject({ ok: false, missing: "name" });
    expect(CONSENT_SENDER_GAP_LABEL.address).toBe("Needs your mailing address");
    expect(CONSENT_SENDER_GAP_LABEL.contact).toBe("Needs your phone, email or website");
    expect(CONSENT_SENDER_GAP_LABEL.name).toBe("Needs your name");
  });

  it("reads a postal code and an email in the signature as address and contact", () => {
    const out = consentRequestEmailFooter({ emailSignature: "Andrew Shaw\n9 King St, Saint John NB E2L 4N8\nandrew@example.ca" });
    expect(out.ok && out.footer).toMatch(/^Andrew Shaw\n9 King St, Saint John NB E2L 4N8\nandrew@example.ca\n\n/);
  });
});

describe("consentRequestTextSignOff", () => {
  it("is refused while the text footer is off, whatever else is on file", () => {
    expect(consentRequestTextSignOff({ displayName: "Andrew", mailingAddress: "1 Main St E2L 1A1", textFooter: false }))
      .toMatchObject({ ok: false, missing: "text_footer" });
  });
});
