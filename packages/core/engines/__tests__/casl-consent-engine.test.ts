/**
 * The CASL consent status every drafter reads (S.C. 2010, c. 23).
 *
 *   s.10(9)(a) / 10(10)(a): implied consent from a purchase lasts the two
 *     years "immediately before the day on which the message was sent".
 *   s.10(10)(e): from an inquiry, six months.
 *   s.11(3): an unsubscribe is honoured; express consent has no expiry in
 *     the Act and ends when it is withdrawn.
 *
 * Agent Runway counts the anniversary day itself as lapsed (the cautious
 * reading, the same day the old `outreachChannel` rule used).
 */
import { describe, expect, it } from "vitest";
import {
  CASL_IMPLIED_CONSENT_MONTHS,
  CASL_INQUIRY_CONSENT_MONTHS,
  CONSENT_LAPSED_CALL_DAYS,
  CONSENT_LAPSING_WARNING_DAYS,
  addMonthsISO,
  consentLapsingPhase,
  consentRefusalReason,
  consentStateLabel,
  consentStatus,
  purchaseConsentLapsesOn,
  type ConsentRecordInput,
  type ConsentStatusInput,
} from "../casl-consent-engine";

const TODAY = "2026-10-18";

function status(over: Partial<ConsentStatusInput> = {}) {
  return consentStatus({
    client: {},
    closedDeals: [],
    consents: [],
    today: TODAY,
    ...over,
  });
}

const express = (over: Partial<ConsentRecordInput> = {}): ConsentRecordInput => ({
  channel: "email",
  basis: "express",
  source: "agent",
  kind: "other",
  method: "verbal",
  consented_at: "2026-09-01T15:00:00.000Z",
  withdrawn_at: null,
  ...over,
});

describe("rule constants", () => {
  it("are the Act's periods: 2 years from a purchase, 6 months from an inquiry", () => {
    expect(CASL_IMPLIED_CONSENT_MONTHS).toBe(24);
    expect(CASL_INQUIRY_CONSENT_MONTHS).toBe(6);
  });

  it("warn 60 days ahead and keep a call card 30 days after the lapse", () => {
    expect(CONSENT_LAPSING_WARNING_DAYS).toBe(60);
    expect(CONSENT_LAPSED_CALL_DAYS).toBe(30);
  });
});

describe("addMonthsISO / purchaseConsentLapsesOn", () => {
  it("adds calendar months to a date-only value without a time zone", () => {
    expect(addMonthsISO("2024-10-18", 24)).toBe("2026-10-18");
    expect(addMonthsISO("2026-04-30", 6)).toBe("2026-10-30");
    expect(addMonthsISO("2025-12-15", 6)).toBe("2026-06-15");
  });

  it("rolls a day the target month lacks into the next month (Feb 29, Aug 31)", () => {
    // Bought Feb 29 2024: the 2 years immediately before Mar 1 2026 no longer include it.
    expect(addMonthsISO("2024-02-29", 24)).toBe("2026-03-01");
    expect(addMonthsISO("2026-08-31", 6)).toBe("2027-03-03");
  });

  it("reads only the date part of a timestamp and rejects garbage", () => {
    expect(purchaseConsentLapsesOn("2024-11-20")).toBe("2026-11-20");
    expect(purchaseConsentLapsesOn("2024-11-20T00:00:00")).toBe("2026-11-20");
    expect(purchaseConsentLapsesOn("not a date")).toBeNull();
    expect(purchaseConsentLapsesOn("2024-02-30")).toBeNull();
  });
});

describe("consentStatus: no record", () => {
  it("is no_record (drafting unchanged) for a client with no deal and no consent", () => {
    const s = status();
    expect(s.email.state).toBe("no_record");
    expect(s.email.canMessage).toBe(true);
    expect(s.sms.state).toBe("no_record");
    expect(s.lastClose).toBeNull();
  });
});

describe("consentStatus: implied from a purchase", () => {
  it("holds until the day before the two-year anniversary of the last closing", () => {
    const s = status({ closedDeals: [{ close_date: "2024-10-19", condition_status: "firmed" }] });
    expect(s.email.state).toBe("implied");
    expect(s.email.basis).toBe("purchase");
    expect(s.email.canMessage).toBe(true);
    expect(s.email.lapsesOn).toBe("2026-10-19");
    expect(s.email.impliedUntil).toBe("2026-10-18");
    expect(s.email.daysLeft).toBe(1);
    expect(s.sms.state).toBe("implied");
    expect(s.lastClose).toBe("2024-10-19");
  });

  it("is lapsed on the anniversary day itself (boundary)", () => {
    const s = status({ closedDeals: [{ close_date: "2024-10-18" }] });
    expect(s.email.state).toBe("lapsed");
    expect(s.email.canMessage).toBe(false);
    expect(s.email.lapsesOn).toBe("2026-10-18");
    expect(s.email.daysLeft).toBeNull();
  });

  it("uses the most recent closing, and a collapsed deal is not a purchase", () => {
    const s = status({
      closedDeals: [
        { close_date: "2019-06-01" },
        { close_date: "2025-03-10", condition_status: "firmed" },
        { close_date: "2026-09-01", condition_status: "collapsed" },
      ],
    });
    expect(s.lastClose).toBe("2025-03-10");
    expect(s.email.lapsesOn).toBe("2027-03-10");
  });

  it("fails closed on a closing date it can't read", () => {
    const s = status({ closedDeals: [{ close_date: "garbage" }] });
    expect(s.email.state).toBe("lapsed");
    expect(s.email.canMessage).toBe(false);
    expect(s.email.lapsesOn).toBeNull();
  });

  it("ignores deals with no close date", () => {
    expect(status({ closedDeals: [{ close_date: null }] }).email.state).toBe("no_record");
  });
});

describe("consentStatus: implied from an inquiry", () => {
  const inquiry = (at: string, over: Partial<ConsentRecordInput> = {}): ConsentRecordInput =>
    express({ basis: "implied_inquiry", consented_at: at, ...over });

  it("holds for six months from the inquiry day", () => {
    const s = status({ consents: [inquiry("2026-04-19T14:00:00.000Z")] });
    expect(s.email.state).toBe("implied");
    expect(s.email.basis).toBe("inquiry");
    expect(s.email.lapsesOn).toBe("2026-10-19");
    expect(s.sms.state).toBe("no_record"); // recorded for email only
  });

  it("is lapsed on the six-month day", () => {
    const s = status({ consents: [inquiry("2026-04-18T14:00:00.000Z")] });
    expect(s.email.state).toBe("lapsed");
    expect(s.email.canMessage).toBe(false);
  });

  it("reads the inquiry day in Atlantic time, not UTC", () => {
    // 01:30 UTC on Apr 19 is 10:30 pm Apr 18 in Halifax: lapses Oct 18.
    const s = status({ consents: [inquiry("2026-04-19T01:30:00.000Z")] });
    expect(s.email.lapsesOn).toBe("2026-10-18");
    expect(s.email.state).toBe("lapsed");
  });

  it("takes the later of a purchase and an inquiry", () => {
    const s = status({
      closedDeals: [{ close_date: "2024-01-05" }],
      consents: [inquiry("2026-08-01T15:00:00.000Z")],
    });
    expect(s.email.basis).toBe("inquiry");
    expect(s.email.lapsesOn).toBe("2027-02-01");
  });

  it("a withdrawn inquiry record gives no consent", () => {
    const s = status({ consents: [inquiry("2026-08-01T15:00:00.000Z", { withdrawn_at: "2026-09-01T15:00:00.000Z" })] });
    expect(s.email.state).toBe("no_record");
  });
});

describe("consentStatus: express", () => {
  it("unlocks drafting for a past client whose implied consent lapsed", () => {
    const s = status({
      closedDeals: [{ close_date: "2021-05-01" }],
      consents: [express()],
    });
    expect(s.email.state).toBe("express");
    expect(s.email.canMessage).toBe(true);
    expect(s.email.since).toBe("2026-09-01");
    expect(s.sms.state).toBe("lapsed"); // express was for email only
  });

  it("is per channel: an sms record covers texts only", () => {
    const s = status({
      closedDeals: [{ close_date: "2021-05-01" }],
      consents: [express({ channel: "sms" })],
    });
    expect(s.email.state).toBe("lapsed");
    expect(s.sms.state).toBe("express");
  });

  it("a withdrawn express record no longer counts", () => {
    const s = status({
      closedDeals: [{ close_date: "2021-05-01" }],
      consents: [express({ withdrawn_at: "2026-10-01T12:00:00.000Z" })],
    });
    expect(s.email.state).toBe("lapsed");
  });

  it("a website sign-up for one list (market letter) is not consent for one-to-one outreach", () => {
    const s = status({
      closedDeals: [{ close_date: "2021-05-01" }],
      consents: [express({ source: "website", kind: "market_letter", method: null })],
    });
    expect(s.email.state).toBe("lapsed");
  });

  it("legacy rows with no channel or basis read as express email", () => {
    const s = status({
      closedDeals: [{ close_date: "2021-05-01" }],
      consents: [{ source: "agent", consented_at: "2026-09-01T15:00:00.000Z" }],
    });
    expect(s.email.state).toBe("express");
  });
});

describe("consentStatus: unsubscribed", () => {
  it("an email opt-out blocks email whatever the deals say", () => {
    const s = status({
      client: { email_opt_out_at: "2026-10-01T12:00:00.000Z" },
      closedDeals: [{ close_date: "2026-01-10" }],
    });
    expect(s.email.state).toBe("opted_out");
    expect(s.email.canMessage).toBe(false);
    expect(s.email.since).toBe("2026-10-01");
    expect(s.sms.state).toBe("implied");
  });

  it("a text opt-out blocks texts only", () => {
    const s = status({
      client: { sms_opt_out_at: "2026-10-01T12:00:00.000Z" },
      closedDeals: [{ close_date: "2026-01-10" }],
    });
    expect(s.sms.state).toBe("opted_out");
    expect(s.email.state).toBe("implied");
  });

  it("beats express consent given before the opt-out", () => {
    const s = status({
      client: { email_opt_out_at: "2026-10-01T12:00:00.000Z" },
      consents: [express({ consented_at: "2026-09-01T15:00:00.000Z" })],
    });
    expect(s.email.state).toBe("opted_out");
  });

  it("is lifted by express consent given after it", () => {
    const s = status({
      client: { email_opt_out_at: "2026-10-01T12:00:00.000Z" },
      consents: [express({ consented_at: "2026-10-05T15:00:00.000Z" })],
    });
    expect(s.email.state).toBe("express");
  });

  it("is not lifted by a website list sign-up after it (the site clears its own flag)", () => {
    const s = status({
      client: { email_opt_out_at: "2026-10-01T12:00:00.000Z" },
      consents: [express({ source: "website", kind: "alerts", consented_at: "2026-10-05T15:00:00.000Z" })],
    });
    expect(s.email.state).toBe("opted_out");
  });
});

describe("consentLapsingPhase", () => {
  const past = (close: string) => status({ closedDeals: [{ close_date: close }] }).email;

  it("asks from 60 days before the lapse, with the last implied day as trigger", () => {
    // Lapses 2026-12-17: 60 days from 2026-10-18.
    const p = consentLapsingPhase(past("2024-12-17"), TODAY);
    expect(p).toEqual({ phase: "ask", lapsesOn: "2026-12-17", triggerDate: "2026-12-16", daysLeft: 60 });
  });

  it("is silent 61 days before the lapse", () => {
    expect(consentLapsingPhase(past("2024-12-18"), TODAY)).toBeNull();
  });

  it("still asks on the last implied day", () => {
    expect(consentLapsingPhase(past("2024-10-19"), TODAY)?.phase).toBe("ask");
  });

  it("is a call card from the lapse day for 30 days, then silent", () => {
    expect(consentLapsingPhase(past("2024-10-18"), TODAY)?.phase).toBe("call");
    expect(consentLapsingPhase(past("2024-09-19"), TODAY)?.phase).toBe("call"); // lapsed 29 days ago
    expect(consentLapsingPhase(past("2024-09-18"), TODAY)).toBeNull(); // 30 days ago
  });

  it("never fires for express consent, an opt-out, an inquiry or no record", () => {
    const withExpress = status({ closedDeals: [{ close_date: "2024-11-01" }], consents: [express()] }).email;
    const optedOut = status({ client: { email_opt_out_at: "2026-10-01T12:00:00Z" }, closedDeals: [{ close_date: "2024-11-01" }] }).email;
    const inquiry = status({ consents: [express({ basis: "implied_inquiry", consented_at: "2026-05-01T12:00:00Z" })] }).email;
    expect(consentLapsingPhase(withExpress, TODAY)).toBeNull();
    expect(consentLapsingPhase(optedOut, TODAY)).toBeNull();
    expect(consentLapsingPhase(inquiry, TODAY)).toBeNull();
    expect(consentLapsingPhase(status().email, TODAY)).toBeNull();
  });
});

describe("copy: information, not advice", () => {
  const FORBIDDEN = /\b(should|must|recommend|need to)\b/i;
  const all = [
    status({ closedDeals: [{ close_date: "2025-03-10" }] }),
    status({ closedDeals: [{ close_date: "2021-03-10" }] }),
    status({ closedDeals: [{ close_date: "x" }] }),
    status({ consents: [express()] }),
    status({ consents: [express({ basis: "implied_inquiry", consented_at: "2026-05-01T12:00:00Z" })] }),
    status({ client: { email_opt_out_at: "2026-10-01T12:00:00Z", sms_opt_out_at: "2026-10-01T12:00:00Z" } }),
    status(),
  ];

  it("never tells the agent what they should do and uses no em dashes", () => {
    for (const s of all) {
      for (const ch of [s.email, s.sms]) {
        for (const text of [ch.reason, consentStateLabel(ch), consentRefusalReason(ch, "Sam Lee")]) {
          expect(text).not.toMatch(FORBIDDEN);
          expect(text).not.toContain("—");
        }
      }
    }
  });

  it("states the purchase rule and the dates in words", () => {
    const lapsed = status({ closedDeals: [{ close_date: "2023-05-01" }] }).email;
    const r = consentRefusalReason(lapsed, "Sam Lee");
    expect(r).toContain("Sam Lee");
    expect(r).toContain("May 2023"); // first-of-month: no shift to April
    expect(r).toMatch(/CASL/);
    expect(r).toMatch(/2 years/);
    expect(r).toMatch(/call/i);
    expect(r).toMatch(/express consent/i);
    expect(consentStateLabel(lapsed)).toMatch(/call only/i);
  });

  it("names the channel in the refusal", () => {
    const optedOut = status({ client: { sms_opt_out_at: "2026-10-01T12:00:00Z" } }).sms;
    expect(consentRefusalReason(optedOut, "Pat")).toMatch(/text/);
    expect(consentRefusalReason(optedOut, "Pat")).toContain("October 1, 2026");
  });

  it("labels implied consent with the last day it holds", () => {
    const implied = status({ closedDeals: [{ close_date: "2025-03-10" }] }).email;
    expect(consentStateLabel(implied)).toBe("Implied until March 9, 2027");
  });
});
