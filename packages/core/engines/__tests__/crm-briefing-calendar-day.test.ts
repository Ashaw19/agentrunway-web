/**
 * Intelligence Briefing: date-only alerts count calendar days from `today`
 * =======================================================================
 * Birthdays, closing anniversaries, mortgage renewals, home-value milestones
 * and listing appointments come from date-only columns (birthdate,
 * close_date, appointment_date). The engine used to measure them against the
 * current instant:
 *
 *   - `Math.floor((midnightOfTheDay - now) / day)` is one short for any time
 *     after midnight, so tomorrow's birthday read "today!" and the day
 *     after's read "tomorrow", in every time zone.
 *   - On the server (Vercel, UTC) the instant's calendar is UTC. From 8 pm
 *     Atlantic the labels moved a further day, and on Dec 31 evening the
 *     year had already turned: a Dec 31 birthday was looked up in next
 *     December and dropped from the briefing.
 *
 * The engine now takes a calendar anchor (`today`, default the runtime's own
 * day) and server callers pass atlanticNoon(). Elapsed-time rules (VIP going
 * dark, new-lead age) still read the real clock.
 *
 * Instants are pinned; expectations hold in any host zone.
 * Fixtures are COMPLETE objects (no `as` casts, repo rule).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { computeIntelligenceBriefing, type BriefingItem } from "../crm-analytics-engine";
import { atlanticNoon } from "../../lib/local-date";
import type {
  Client,
  ClientRecord,
  ContactActivity,
  ListingAppointment,
} from "../../types/database";

const OCT9_NOON = "2026-10-09T15:00:00Z"; // Oct 9, 12:00 ADT
const OCT9_MORNING = "2026-10-09T11:00:00Z"; // Oct 9, 08:00 ADT
const OCT9_EVENING = "2026-10-10T01:00:00Z"; // Oct 9, 22:00 ADT (UTC is Oct 10)
const DEC31_EVENING = "2027-01-01T02:00:00Z"; // Dec 31 2026, 22:00 AST (UTC is 2027)

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

afterEach(() => {
  vi.useRealTimers();
});

function makeClient(overrides: Partial<Client> & { id: string; name: string }): Client {
  return {
    user_id: "u1",
    name_search: overrides.name.toLowerCase(),
    first_name: null,
    last_name: null,
    email: `${overrides.id}@example.com`,
    phone: null,
    birthdate: null,
    tags: [],
    lead_source: null,
    last_contact_at: null,
    notes: null,
    status: "scheduled",
    city: null,
    province_region: null,
    street_address: null,
    unit_number: null,
    postal_code: null,
    country: "Canada",
    phone_type: "mobile",
    secondary_email: null,
    secondary_phone: null,
    secondary_phone_type: "mobile",
    property_interest: null,
    property_interest_type: "budget",
    timeframe: null,
    preferred_contact: "phone",
    first_contacted_at: "2020-01-15T15:00:00.000Z",
    archived_at: null,
    archive_reason: null,
    communication_tone: "friendly",
    buyer_pre_approved: null,
    buyer_pre_approval_amount: null,
    buyer_financing_type: null,
    buyer_target_close_date: null,
    buyer_target_area: null,
    imported_at: null,
    scheduled_for: null,
    scheduled_phrase: null,
    engagement_score: 0,
    engagement_updated_at: null,
    created_at: "2020-01-10T15:00:00.000Z",
    updated_at: "2020-01-10T15:00:00.000Z",
    ...overrides,
  };
}

function makeRecord(closeDate: string): ClientRecord {
  return {
    id: `r_${closeDate}`,
    user_id: "u1",
    client_id: "c1",
    name: "Deal",
    side: "buyer",
    source: null,
    address: "1 Main St",
    year: Number(closeDate.slice(0, 4)),
    close_date: closeDate,
    gci: 10_000,
    notes: null,
    property_use: "primary_residence",
    bedrooms: null,
    bathrooms: null,
    garage: null,
    lot_acres: null,
    waterfront: null,
    square_feet: null,
    listing_url: null,
    condition_date: null,
    condition_status: null,
    import_external_id: null,
    edited_at: null,
    created_at: "2020-01-10T15:00:00.000Z",
    updated_at: "2020-01-10T15:00:00.000Z",
  };
}

function makeListing(status: "scheduled" | "active", appointmentDate: string): ListingAppointment {
  return {
    id: "la1",
    user_id: "u1",
    client_id: null,
    appointment_date: appointmentDate,
    property_address: "2 Elm St",
    estimated_list_price: null,
    actual_list_price: null,
    actual_sale_price: null,
    status,
    estimated_commission_pct: null,
    expected_close_date: null,
    listing_agreement_date: null,
    notes: null,
    close_odds_pct: null,
    lost_reason: null,
    converted_to_pipeline_deal_id: null,
    created_at: "2026-08-01T15:00:00.000Z",
    updated_at: "2026-08-01T15:00:00.000Z",
  };
}

interface Scenario {
  client?: Partial<Client>;
  closeDates?: string[];
  activities?: ContactActivity[];
  listings?: ListingAppointment[];
}

/**
 * The briefing as the server computes it at `instant`: the real clock is
 * that instant, and the calendar anchor is the Atlantic day.
 */
function serverBriefingAt(instant: string, scenario: Scenario = {}): BriefingItem[] {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
  const client = makeClient({ id: "c1", name: "Pat Example", ...scenario.client });
  return computeIntelligenceBriefing(
    [client],
    scenario.activities ?? [],
    (scenario.closeDates ?? []).map(makeRecord),
    scenario.listings,
    atlanticNoon(),
  ).items;
}

const ofType = (items: BriefingItem[], ...types: string[]) =>
  items.filter((i) => types.includes(i.type));

const birthdayAt = (instant: string, birthdate: string) =>
  ofType(serverBriefingAt(instant, { client: { birthdate } }), "birthday_today", "birthday_soon");

describe("computeIntelligenceBriefing: birthdays by calendar day", () => {
  it.each([
    ["midday", OCT9_NOON],
    ["evening, after the UTC day has turned", OCT9_EVENING],
  ])("a birthday today reads today (%s)", (_label, instant) => {
    const [item, ...rest] = birthdayAt(instant, "1990-10-09");
    expect(rest).toHaveLength(0);
    expect(item.title).toBe("Pat Example: birthday today!");
    expect(item.detail).toBe("October 9");
    expect(item.type).toBe("birthday_today");
    expect(item.daysValue).toBe(0);
  });

  it.each([
    ["midday", OCT9_NOON],
    ["evening, after the UTC day has turned", OCT9_EVENING],
  ])("a birthday tomorrow reads tomorrow, not today (%s)", (_label, instant) => {
    const [item] = birthdayAt(instant, "1990-10-10");
    expect(item.title).toBe("Pat Example: birthday tomorrow");
    expect(item.detail).toBe("October 10");
    expect(item.type).toBe("birthday_today");
    expect(item.severity).toBe("urgent");
    expect(item.daysValue).toBe(1);
  });

  it("a birthday the day after tomorrow reads in 2 days and is not urgent", () => {
    const [item] = birthdayAt(OCT9_EVENING, "1990-10-11");
    expect(item.title).toBe("Pat Example: birthday in 2 days");
    expect(item.type).toBe("birthday_soon");
    expect(item.severity).toBe("upcoming");
    expect(item.daysValue).toBe(2);
  });

  it("yesterday's birthday has moved to next year", () => {
    expect(birthdayAt(OCT9_EVENING, "1990-10-08")).toHaveLength(0);
  });

  it("the window is the next 14 calendar days", () => {
    expect(birthdayAt(OCT9_EVENING, "1990-10-23")[0].title).toBe("Pat Example: birthday in 14 days");
    expect(birthdayAt(OCT9_EVENING, "1990-10-24")).toHaveLength(0);
  });

  it("a Dec 31 birthday is still today on Dec 31 evening (UTC is already next year)", () => {
    const [item, ...rest] = birthdayAt(DEC31_EVENING, "1985-12-31");
    expect(rest).toHaveLength(0);
    expect(item.title).toBe("Pat Example: birthday today!");
    expect(item.detail).toBe("December 31");
    expect(item.id).toBe("bday_c1_2026");
  });

  it("a Jan 1 birthday is tomorrow on Dec 31 evening", () => {
    const [item] = birthdayAt(DEC31_EVENING, "1985-01-01");
    expect(item.title).toBe("Pat Example: birthday tomorrow");
    expect(item.id).toBe("bday_c1_2027");
  });
});

describe("computeIntelligenceBriefing: closing anniversaries by calendar day", () => {
  const anniversaryAt = (instant: string, closeDate: string) =>
    ofType(serverBriefingAt(instant, { closeDates: [closeDate] }), "closing_anniversary");

  it("an anniversary today reads today in the evening", () => {
    const [item, ...rest] = anniversaryAt(OCT9_EVENING, "2024-10-09");
    expect(rest).toHaveLength(0);
    expect(item.title).toBe("Pat Example: 2-year closing anniversary today!");
    expect(item.detail).toBe("October 9");
    expect(item.daysValue).toBe(0);
  });

  it("an anniversary tomorrow reads tomorrow, not today", () => {
    expect(anniversaryAt(OCT9_NOON, "2024-10-10")[0].title).toBe(
      "Pat Example: 2-year closing anniversary tomorrow",
    );
    expect(anniversaryAt(OCT9_EVENING, "2024-10-10")[0].title).toBe(
      "Pat Example: 2-year closing anniversary tomorrow",
    );
  });

  it("yesterday's anniversary has moved to next year", () => {
    expect(anniversaryAt(OCT9_EVENING, "2024-10-08")).toHaveLength(0);
  });

  it("a Dec 31 closing is a 1-year anniversary today on Dec 31 evening", () => {
    const [item] = anniversaryAt(DEC31_EVENING, "2025-12-31");
    expect(item.title).toBe("Pat Example: 1-year closing anniversary today!");
  });

  it("a Jan 1 closing is a 1-year anniversary tomorrow on Dec 31 evening", () => {
    const [item] = anniversaryAt(DEC31_EVENING, "2026-01-01");
    expect(item.title).toBe("Pat Example: 1-year closing anniversary tomorrow");
  });
});

describe("computeIntelligenceBriefing: other date-only countdowns", () => {
  it("the 14-day anniversary window hands off to the 15-30 day milestone window", () => {
    // 1-year mark 14 days out: closing anniversary, no milestone yet.
    const day14 = serverBriefingAt(OCT9_EVENING, { closeDates: ["2025-10-23"] });
    expect(ofType(day14, "closing_anniversary")[0].title).toBe(
      "Pat Example: 1-year closing anniversary in 14 days",
    );
    expect(ofType(day14, "property_value_milestone")).toHaveLength(0);

    // 15 days out: milestone, no closing anniversary yet.
    const day15 = serverBriefingAt(OCT9_EVENING, { closeDates: ["2025-10-24"] });
    expect(ofType(day15, "closing_anniversary")).toHaveLength(0);
    expect(ofType(day15, "property_value_milestone")[0].title).toBe(
      "Pat Example: 1-year home anniversary in 15 days",
    );
  });

  it("a mortgage renewal tomorrow reads in 1 day, not overdue", () => {
    const [item] = ofType(
      serverBriefingAt(OCT9_EVENING, { closeDates: ["2021-10-10"] }),
      "mortgage_renewal_due",
    );
    expect(item.title).toBe("Pat Example: mortgage renewal in 1 day");
    expect(item.daysValue).toBe(1);
  });

  it("a listing appointment 3 days ago is overdue from the morning, not from noon", () => {
    const [item] = ofType(
      serverBriefingAt(OCT9_MORNING, { listings: [makeListing("scheduled", "2026-10-06")] }),
      "listing_appointment_overdue",
    );
    expect(item.detail).toBe("Scheduled 3 days ago, still not active");
  });

  it("an active listing counts whole days on market", () => {
    const [item] = ofType(
      serverBriefingAt(OCT9_MORNING, { listings: [makeListing("active", "2026-08-25")] }),
      "listing_stale",
    );
    expect(item.detail).toBe("45 days on market without sale");
  });
});

describe("computeIntelligenceBriefing: elapsed-time rules still read the real clock", () => {
  // atlanticNoon() is 10 to 13 hours before OCT9_EVENING. If an elapsed-time
  // rule measured from the anchor, each case below would land under its threshold.
  const evening = new Date(OCT9_EVENING).getTime();

  function call(clientId: string, at: number): ContactActivity {
    const when = new Date(at).toISOString();
    return {
      id: `a_${at}`,
      user_id: "u1",
      client_id: clientId,
      type: "call",
      description: "",
      activity_date: when,
      created_at: when,
    };
  }

  it("a VIP is overdue 14 full days after the last contact", () => {
    const items = serverBriefingAt(OCT9_EVENING, {
      client: { tags: ["VIP"] },
      activities: [call("c1", evening - 14 * DAY - HOUR)],
    });
    expect(ofType(items, "vip_overdue")[0].detail).toBe("14 days without contact");
  });

  it("a VIP is not overdue one hour short of 14 days", () => {
    const items = serverBriefingAt(OCT9_EVENING, {
      client: { tags: ["VIP"] },
      activities: [call("c1", evening - 14 * DAY + HOUR)],
    });
    expect(ofType(items, "vip_overdue")).toHaveLength(0);
  });

  it("a new lead is flagged 24 hours after it arrived", () => {
    const items = serverBriefingAt(OCT9_EVENING, {
      client: {
        status: "boarding",
        first_contacted_at: null,
        created_at: new Date(evening - 24.5 * HOUR).toISOString(),
      },
    });
    expect(ofType(items, "uncontacted_lead")[0].detail).toBe("24hr old, follow up today");
  });
});

describe("computeIntelligenceBriefing: the calendar anchor", () => {
  it("defaults to the runtime's own day (browser callers)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 22, 0)); // host-local Oct 9, 22:00
    const client = makeClient({ id: "c1", name: "Pat Example", birthdate: "1990-10-10" });
    const items = computeIntelligenceBriefing([client], [], []).items;
    expect(ofType(items, "birthday_today")[0].title).toBe("Pat Example: birthday tomorrow");
  });

  it("reads only the anchor's calendar day, not its time", () => {
    const lateEvening = new Date(2026, 9, 9, 23, 59); // host-local Oct 9, 23:59
    const briefing = (birthdate: string) =>
      computeIntelligenceBriefing(
        [makeClient({ id: "c1", name: "Pat Example", birthdate })],
        [],
        [],
        undefined,
        lateEvening,
      ).items;
    expect(ofType(briefing("1990-10-09"), "birthday_today")[0].title).toBe("Pat Example: birthday today!");
    expect(ofType(briefing("1990-10-10"), "birthday_today")[0].title).toBe("Pat Example: birthday tomorrow");
  });
});
