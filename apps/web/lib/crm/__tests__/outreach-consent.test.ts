import { describe, it, expect } from "vitest";
import {
  consentInputsFor,
  consentOnSendDay,
  emailBlockedClients,
  emailChannelFor,
  lastClosedDealByClient,
  sendDay,
  withCoBuyerDeals,
  type ConsentInputs,
} from "../outreach-consent";
import type { ConsentLedgerRow } from "@agent-runway/core/types/database";

/**
 * The CASL gate every drafter reads, wired to the rows each surface fetches.
 * The rule is consentStatus() in packages/core (its own boundary tests live
 * in packages/core/engines/__tests__/casl-consent-engine.test.ts); these
 * check the send-day evaluation, co-buyers and the express / unsubscribe
 * overrides as the web surfaces see them.
 */

const TODAY = "2026-10-06";

const inputs = (over: Partial<ConsentInputs> = {}): ConsentInputs => ({
  client: {},
  closedDeals: [],
  consents: [],
  ...over,
});

const deal = (close_date: string, condition_status: string | null = "firmed") => ({ close_date, condition_status });

const expressRow = (over: Partial<ConsentLedgerRow> = {}): ConsentLedgerRow => ({
  id: "x1",
  client_id: "a",
  kind: "other",
  source: "agent",
  channel: "email",
  basis: "express",
  method: "verbal",
  consent_text: "Yes, keep in touch.",
  evidence_note: null,
  consented_at: "2026-09-20T15:00:00.000Z",
  recorded_via: "web",
  withdrawn_at: null,
  withdrawn_method: null,
  withdrawn_note: null,
  created_at: "2026-09-20T15:00:00.000Z",
  ...over,
});

describe("lastClosedDealByClient", () => {
  it("keeps the most recent close per client", () => {
    const map = lastClosedDealByClient([
      { client_id: "a", close_date: "2021-05-01", condition_status: "firmed" },
      { client_id: "a", close_date: "2025-03-10", condition_status: "firmed" },
      { client_id: "b", close_date: "2019-08-20", condition_status: null },
    ]);
    expect(map.get("a")).toBe("2025-03-10");
    expect(map.get("b")).toBe("2019-08-20");
  });

  it("ignores collapsed deals — a collapsed deal is not a purchase", () => {
    const map = lastClosedDealByClient([
      { client_id: "a", close_date: "2020-01-15", condition_status: "firmed" },
      { client_id: "a", close_date: "2026-06-01", condition_status: "collapsed" },
    ]);
    expect(map.get("a")).toBe("2020-01-15");
  });
});

describe("sendDay", () => {
  it("is the trigger date when it is still ahead, else today", () => {
    expect(sendDay("2026-10-20", TODAY)).toBe("2026-10-20");
    expect(sendDay("2026-09-20", TODAY)).toBe(TODAY);
    expect(sendDay(null, TODAY)).toBe(TODAY);
  });
});

describe("emailChannelFor (the old outreachChannel cases, now through consentStatus)", () => {
  it("does not gate clients with no closed deal and no consent record", () => {
    expect(emailChannelFor(undefined, "2026-10-10", TODAY)).toBe("email");
    expect(emailChannelFor(inputs(), "2026-10-10", TODAY)).toBe("email");
  });

  it("allows email inside the two-year window", () => {
    expect(emailChannelFor(inputs({ closedDeals: [deal("2024-11-20")] }), TODAY, TODAY)).toBe("email");
  });

  it("treats the exact two-year mark as lapsed", () => {
    expect(emailChannelFor(inputs({ closedDeals: [deal("2024-10-06")] }), TODAY, TODAY)).toBe("call");
    expect(emailChannelFor(inputs({ closedDeals: [deal("2024-10-07")] }), TODAY, TODAY)).toBe("email");
  });

  it("measures at the trigger date when it is in the future", () => {
    // Lapses 2026-10-15. A message meant for 10-20 goes out after that.
    expect(emailChannelFor(inputs({ closedDeals: [deal("2024-10-15")] }), "2026-10-20", TODAY)).toBe("call");
    expect(emailChannelFor(inputs({ closedDeals: [deal("2024-10-15")] }), "2026-10-10", TODAY)).toBe("email");
  });

  it("measures at today when the trigger date has already passed", () => {
    expect(emailChannelFor(inputs({ closedDeals: [deal("2024-10-01")] }), "2026-09-20", TODAY)).toBe("call");
  });

  it("gates multi-year closing anniversaries with no newer deal", () => {
    expect(emailChannelFor(inputs({ closedDeals: [deal("2021-10-12")] }), "2026-10-12", TODAY)).toBe("call");
  });

  it("express consent the agent recorded reopens email for a lapsed past client", () => {
    const i = inputs({ closedDeals: [deal("2021-10-12")], consents: [expressRow()] });
    expect(emailChannelFor(i, "2026-10-12", TODAY)).toBe("email");
    // ...for email only: texts stay call-only.
    expect(consentOnSendDay(i, TODAY, TODAY).sms.canMessage).toBe(false);
  });

  it("an unsubscribe blocks email whatever the deals or an older consent say", () => {
    const i = inputs({
      client: { email_opt_out_at: "2026-10-01T12:00:00.000Z" },
      closedDeals: [deal("2026-01-10")],
      consents: [expressRow()],
    });
    expect(emailChannelFor(i, TODAY, TODAY)).toBe("call");
  });
});

describe("consentInputsFor + withCoBuyerDeals", () => {
  // A couple's deal is one client_records row held by one spouse (#257).
  const deals = [{ id: "r1", client_id: "pat", close_date: "2021-04-01", condition_status: "firmed" }];

  it("credits a co-buyer with the deal they were named on", () => {
    const map = lastClosedDealByClient(withCoBuyerDeals(deals, [{ client_record_id: "r1", co_client_id: "jo" }]));
    expect(map.get("jo")).toBe("2021-04-01");
    expect(map.get("pat")).toBe("2021-04-01");
  });

  it("does not credit a collapsed deal to the co-buyer", () => {
    const map = lastClosedDealByClient(withCoBuyerDeals(
      [{ id: "r1", client_id: "pat", close_date: "2021-04-01", condition_status: "collapsed" }],
      [{ client_record_id: "r1", co_client_id: "jo" }],
    ));
    expect(map.has("jo")).toBe(false);
  });

  it("puts a lapsed co-buyer on the newsletter's lapsed list, and an express one off it", () => {
    const map = consentInputsFor(
      [{ id: "pat" }, { id: "jo" }, { id: "sam", email_opt_out_at: "2026-09-01T12:00:00.000Z" }, { id: "lee" }],
      deals,
      [{ client_record_id: "r1", co_client_id: "jo" }],
      [expressRow({ client_id: "pat" })],
    );
    expect(emailBlockedClients(map, TODAY)).toEqual({ lapsed: ["jo"], optedOut: ["sam"] });
  });
});
