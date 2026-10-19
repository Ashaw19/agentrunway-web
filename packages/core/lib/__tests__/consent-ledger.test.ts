/**
 * What a consent record needs before it is saved (CASL s.13: the sender has
 * the onus of proving consent), and how a withdrawal lands.
 */
import { describe, expect, it } from "vitest";
import {
  atlanticConsentClock,
  checkRecordConsent,
  checkWithdrawConsent,
  consentInputsByClient,
  consentInsertRows,
  consentInstant,
  creditCoBuyers,
  withdrawalClientPatch,
  withdrawalRowPatch,
  type ConsentClock,
  type RecordConsentInput,
} from "../consent-ledger";
import { consentStatus } from "../../engines/casl-consent-engine";

const NOW = new Date("2026-10-18T15:30:00.000Z"); // 12:30 pm Atlantic
const CLOCK: ConsentClock = atlanticConsentClock(NOW);

const base: RecordConsentInput = {
  clientId: "c1",
  channels: ["email"],
  basis: "express",
  method: "verbal",
  date: "2026-10-10",
  wording: "Yes, keep sending me the odd note.",
  note: null,
  recordedVia: "web",
};

describe("atlanticConsentClock", () => {
  it("is the Atlantic day, and stores another day at noon Atlantic", () => {
    expect(CLOCK.today).toBe("2026-10-18");
    expect(consentInstant("2026-10-10", CLOCK)).toBe("2026-10-10T15:00:00.000Z"); // ADT, UTC-3
    expect(consentInstant("2026-12-10", { ...CLOCK, today: "2026-12-20" })).toBe("2026-12-10T16:00:00.000Z"); // AST
  });

  it("stores today as the moment it was recorded", () => {
    expect(consentInstant("2026-10-18", CLOCK)).toBe(NOW.toISOString());
  });

  it("reads 11 pm Atlantic as that day, not the next UTC day", () => {
    expect(atlanticConsentClock(new Date("2026-10-19T02:00:00.000Z")).today).toBe("2026-10-18");
  });
});

describe("checkRecordConsent", () => {
  it("accepts a complete express record and shapes one row per channel", () => {
    const r = checkRecordConsent({ ...base, channels: ["sms", "email", "email"] }, CLOCK, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.channels).toEqual(["email", "sms"]);
    const rows = consentInsertRows("u1", r.value);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: "u1", client_id: "c1", kind: "other", source: "agent", channel: "email",
      basis: "express", method: "verbal", consent_text: "Yes, keep sending me the odd note.",
      evidence_note: null, consented_at: "2026-10-10T15:00:00.000Z", recorded_via: "web",
    });
  });

  it("requires the method", () => {
    const r = checkRecordConsent({ ...base, method: "" }, CLOCK, {});
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toMatch(/how they told you/);
  });

  it("requires a real date, not in the future", () => {
    expect(checkRecordConsent({ ...base, date: "" }, CLOCK, {}).ok).toBe(false);
    expect(checkRecordConsent({ ...base, date: "2026-02-30" }, CLOCK, {}).ok).toBe(false);
    const future = checkRecordConsent({ ...base, date: "2026-10-19" }, CLOCK, {});
    expect(!future.ok && future.error).toMatch(/future/);
    expect(checkRecordConsent({ ...base, date: "2026-10-18" }, CLOCK, {}).ok).toBe(true);
  });

  it("requires the wording or a note on where the proof is", () => {
    const r = checkRecordConsent({ ...base, wording: "  ", note: "" }, CLOCK, {});
    expect(r.ok).toBe(false);
    expect(checkRecordConsent({ ...base, wording: "", note: "Saved their reply in Outlook" }, CLOCK, {}).ok).toBe(true);
  });

  it("requires a channel, a basis it knows and a method it knows", () => {
    expect(checkRecordConsent({ ...base, channels: [] }, CLOCK, {}).ok).toBe(false);
    expect(checkRecordConsent({ ...base, channels: ["fax"] }, CLOCK, {}).ok).toBe(false);
    expect(checkRecordConsent({ ...base, basis: "implied_purchase" }, CLOCK, {}).ok).toBe(false);
    expect(checkRecordConsent({ ...base, method: "telepathy" }, CLOCK, {}).ok).toBe(false);
  });

  it("refuses express consent dated before an unsubscribe on that channel", () => {
    const r = checkRecordConsent(base, CLOCK, { email_opt_out_at: "2026-10-12T12:00:00.000Z" });
    expect(!r.ok && r.error).toMatch(/unsubscribed from email after the date/);
  });

  it("accepts express consent dated after the unsubscribe, and that lifts it", () => {
    const optOuts = { email_opt_out_at: "2026-10-05T12:00:00.000Z" };
    const r = checkRecordConsent(base, CLOCK, optOuts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const status = consentStatus({
      client: optOuts, closedDeals: [{ close_date: "2020-01-01" }],
      consents: consentInsertRows("u1", r.value), today: CLOCK.today,
    });
    expect(status.email.state).toBe("express");
  });

  it("an opt-out on the other channel doesn't block it", () => {
    expect(checkRecordConsent(base, CLOCK, { sms_opt_out_at: "2026-10-12T12:00:00.000Z" }).ok).toBe(true);
  });

  it("saves an old inquiry but says it gives no consent today", () => {
    const r = checkRecordConsent({ ...base, basis: "implied_inquiry", date: "2026-03-01", wording: "", note: "Asked about 12 Elm" }, CLOCK, {});
    expect(r.ok && r.value.warning).toMatch(/6 months.*September 1, 2026/);
  });

  it("saves an inquiry for an unsubscribed client and says the unsubscribe stands", () => {
    const r = checkRecordConsent({ ...base, basis: "implied_inquiry", note: "Asked about 12 Elm" }, CLOCK, { email_opt_out_at: "2026-10-12T12:00:00.000Z" });
    expect(r.ok && r.value.warning).toMatch(/still unsubscribed/);
  });

  it("never uses advice wording or em dashes in its messages", () => {
    const msgs = [
      checkRecordConsent({ ...base, method: "" }, CLOCK, {}),
      checkRecordConsent({ ...base, wording: "", note: "" }, CLOCK, {}),
      checkRecordConsent({ ...base, date: "2026-10-30" }, CLOCK, {}),
      checkRecordConsent(base, CLOCK, { email_opt_out_at: "2026-10-12T12:00:00.000Z" }),
    ].map((r) => (r.ok ? "" : r.error));
    for (const m of msgs) {
      expect(m).not.toMatch(/\b(should|must|recommend|need to)\b/i);
      expect(m).not.toContain("—");
    }
  });
});

describe("withdrawals", () => {
  const w = checkWithdrawConsent(
    { clientId: "c1", channels: ["email", "sms"], method: "text_reply", date: "2026-10-17", note: "Replied STOP", recordedVia: "mobile" },
    CLOCK,
  );

  it("require a method and a date that isn't in the future", () => {
    expect(w.ok).toBe(true);
    expect(checkWithdrawConsent({ clientId: "c1", channels: ["email"], method: "", date: "2026-10-17", recordedVia: "web" }, CLOCK).ok).toBe(false);
    expect(checkWithdrawConsent({ clientId: "c1", channels: ["email"], method: "verbal", date: "2026-11-01", recordedVia: "web" }, CLOCK).ok).toBe(false);
  });

  it("always write each channel's opt-out as the agent's, at the later date", () => {
    if (!w.ok) throw new Error("expected ok");
    // An older opt-out on file (the website's, in January): this withdrawal is
    // later, so it replaces it, and becomes the agent's.
    const patch = withdrawalClientPatch(w.value, { email_opt_out_at: "2026-01-01T12:00:00.000Z" });
    expect(patch).toEqual({
      email_opt_out_at: "2026-10-17T15:00:00.000Z",
      email_opt_out_source: "agent",
      email_opt_out_method: "text_reply",
      email_opt_out_note: "Replied STOP",
      sms_opt_out_at: "2026-10-17T15:00:00.000Z",
      sms_opt_out_source: "agent",
      sms_opt_out_method: "text_reply",
      sms_opt_out_note: "Replied STOP",
    });
    // A later opt-out on file keeps its later date (the latest opt-out wins,
    // since express consent after an opt-out lifts it), but is now the agent's.
    const later = withdrawalClientPatch(w.value, { sms_opt_out_at: "2026-10-18T12:00:00.000Z" });
    expect(later.sms_opt_out_at).toBe("2026-10-18T12:00:00.000Z");
    expect(later.sms_opt_out_source).toBe("agent");
  });

  it("a withdrawal dated after an express consent beats it, an older opt-out on file or not", () => {
    if (!w.ok) throw new Error("expected ok");
    const consents = [{ channel: "sms", basis: "express", source: "agent", consented_at: "2026-06-01T12:00:00.000Z" }];
    const client = withdrawalClientPatch(w.value, { sms_opt_out_at: "2026-01-01T12:00:00.000Z" });
    const s = consentStatus({ client, closedDeals: [], consents, today: CLOCK.today });
    expect(s.sms.state).toBe("opted_out");
    expect(withdrawalRowPatch(w.value)).toEqual({
      withdrawn_at: "2026-10-17T15:00:00.000Z", withdrawn_method: "text_reply", withdrawn_note: "Replied STOP",
    });
  });

  it("block both channels in consentStatus once applied", () => {
    if (!w.ok) throw new Error("expected ok");
    const client = { ...withdrawalClientPatch(w.value, {}) };
    const s = consentStatus({ client, closedDeals: [{ close_date: "2026-01-01" }], consents: [], today: CLOCK.today });
    expect(s.email.state).toBe("opted_out");
    expect(s.sms.state).toBe("opted_out");
  });
});

describe("creditCoBuyers / consentInputsByClient", () => {
  it("credits the co-buyer the deal and groups inputs per client", () => {
    const deals = creditCoBuyers(
      [{ id: "r1", client_id: "pat", close_date: "2025-04-01", condition_status: "firmed" }],
      [{ client_record_id: "r1", co_client_id: "sam" }, { client_record_id: "missing", co_client_id: "x" }],
    );
    expect(deals).toHaveLength(2);
    const map = consentInputsByClient(
      [{ id: "pat" }, { id: "sam", sms_opt_out_at: "2026-10-01T12:00:00Z" }, { id: "lee" }],
      deals,
      [{ client_id: "lee", channel: "email", basis: "express", source: "agent", consented_at: "2026-09-01T12:00:00Z" }],
    );
    expect(map.get("sam")?.closedDeals).toHaveLength(1);
    expect(map.get("sam")?.client.sms_opt_out_at).toBe("2026-10-01T12:00:00Z");
    expect(map.get("lee")?.consents).toHaveLength(1);
    expect(map.get("pat")?.consents).toHaveLength(0);
  });
});
