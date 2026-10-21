/**
 * The vehicle expenses article, checked against CRA (2026-10-21).
 *
 * Follow-up from #365: the article spoke of a "simplified three-month base
 * period". CRA's simplified logbook is a full 12-month base year, then
 * three-month samples in later years. Reviewing the rest against CRA and
 * Finance pages found more:
 *   - It was dated 2025: the 2026 Class 10.1 ceiling is $39,000 (Finance,
 *     2026-01-14), not $38,000.
 *   - It put CCA on line 9281. CRA's line is "Motor vehicle expenses (not
 *     including CCA)"; CCA goes on line 9936.
 *   - It said recapture and terminal loss apply to each Class 10.1 vehicle.
 *     T4002: they "do not apply to passenger vehicles in Class 10.1".
 *   - It said the half-year rule applies in the year a vehicle is bought.
 *     T4002: it does not apply to accelerated investment incentive property
 *     or, under proposed changes, to property acquired after 2024 (RIIPs).
 *   - It claimed, unsourced, that vehicles are the line CRA "scrutinizes
 *     most consistently".
 *   - It described the app (a business-use input on the dashboard's Tax
 *     Readiness card) and the estimator (vehicle costs with a business-use
 *     percentage) as neither works.
 *
 * The limits print from AUTOMOBILE_LIMITS and CRA's logbook wording from the
 * shared rules, so neither is typed on the page.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("@/components/marketing-nav", () => ({ MarketingNav: () => null }));
vi.mock("@/components/marketing-footer", () => ({ MarketingFooter: () => null }));
vi.mock("@/components/email-capture", () => ({ EmailCapture: () => null }));

import {
  AUTOMOBILE_LIMITS,
  MULTIPLE_VEHICLES_RULE,
  SIMPLIFIED_LOGBOOK_EXAMPLE,
  SIMPLIFIED_LOGBOOK_FORMULA,
  SIMPLIFIED_LOGBOOK_OUTSIDE_RANGE_RULE,
  SIMPLIFIED_LOGBOOK_RANGE_RULE,
  SIMPLIFIED_LOGBOOK_RULE,
  VEHICLE_FULL_DEDUCTION_RULE,
  VEHICLE_LOGBOOK_RULE,
  latestAutomobileLimits,
  validateTaxCopy,
} from "@agent-runway/core/tax-copy";
import VehiclePage, { metadata } from "@/app/vehicle-expenses-real-estate-agents-canada/page";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");
const PAGE = "app/vehicle-expenses-real-estate-agents-canada/page.tsx";

/** What a reader sees: tags dropped, entities decoded, one space between words. */
const text = renderToStaticMarkup(createElement(VehiclePage))
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");
const metaText = JSON.stringify(metadata);
const dollars = (n: number) => `$${n.toLocaleString("en-CA")}`;

describe("the newest published limits", () => {
  const { current, previous } = latestAutomobileLimits();

  it("AUTOMOBILE_LIMITS: newest year first, 2026's ceiling up from 2025's", () => {
    expect(AUTOMOBILE_LIMITS.map((r) => r.year)).toEqual([2026, 2025]);
    expect(current).toMatchObject({ year: 2026, ccaCeiling: 39_000, zeroEmissionCeiling: 61_000, leasePerMonth: 1_100, interestPerMonth: 350 });
    expect(previous?.ccaCeiling).toBe(38_000);
  });

  it("the page prints them, with their year, in the body and the title", () => {
    for (const figure of [current.ccaCeiling, current.zeroEmissionCeiling, current.leasePerMonth, current.interestPerMonth]) {
      expect(text).toContain(dollars(figure));
    }
    expect(text).toContain(`up from ${dollars(previous!.ccaCeiling)} in ${previous!.year}`);
    expect(metaText).toContain(`(${current.year})`);
    expect(metaText).not.toMatch(/2025/);
  });

  it("no limit is typed in the page's source", () => {
    expect(source(PAGE)).not.toMatch(/\$3[789],000|\$1,0[05]0|\$1,100|\$350\b|\$61,000/);
  });
});

describe("CRA's logbook, in CRA's words", () => {
  it("a 12-month base year, then three-month samples: never a 'three-month base period'", () => {
    expect(`${text} ${metaText}`).not.toMatch(/three-month base period/i);
    for (const rule of [VEHICLE_LOGBOOK_RULE, SIMPLIFIED_LOGBOOK_RULE, SIMPLIFIED_LOGBOOK_FORMULA, SIMPLIFIED_LOGBOOK_EXAMPLE, SIMPLIFIED_LOGBOOK_RANGE_RULE, SIMPLIFIED_LOGBOOK_OUTSIDE_RANGE_RULE, MULTIPLE_VEHICLES_RULE, VEHICLE_FULL_DEDUCTION_RULE]) {
      expect(text).toContain(String(rule));
    }
  });
});

describe("T2125 lines and CCA", () => {
  it("line 9281 leaves CCA out; the vehicle's CCA is line 9936", () => {
    expect(text).toMatch(/not including CCA/);
    expect(text).toMatch(/line 9936/i);
    expect(text).not.toMatch(/lease or interest, CCA, and so on/);
  });

  it("Class 10.1: recapture and terminal loss don't apply", () => {
    expect(text).not.toMatch(/recapture and terminal-loss rules apply/i);
    expect(text).toMatch(/recapture of CCA and terminal loss do not apply/i);
  });

  it("no blanket half-year rule for a vehicle bought now", () => {
    expect(text).not.toMatch(/half-year rule applying in the\s+year of acquisition/i);
  });
});

describe("claims the page can stand behind", () => {
  it("no unsourced claim about what CRA audits", () => {
    expect(text).not.toMatch(/scrutinizes most|most commonly audited|most scrutinized/i);
  });

  it("the app and the estimator, as they work", () => {
    expect(text).not.toMatch(/tax readiness card/i);
    expect(text).not.toMatch(/accepts vehicle expenses with a business-use percentage/i);
    expect(text).toMatch(/Expenses → Mileage/);
  });

  it("every sentence is information, not advice", () => {
    expect(validateTaxCopy(text).filter((d) => d.level === "error")).toEqual([]);
  });

  it("every citation points at a listed source", () => {
    const page = source(PAGE);
    const ids = new Set([...page.matchAll(/\bid: (\d+),/g)].map((m) => Number(m[1])));
    const cited = [...page.matchAll(/<CRACite id=\{(\d+)\} \/>/g)].map((m) => Number(m[1]));
    expect(cited.length).toBeGreaterThan(10);
    for (const id of cited) expect(ids.has(id), `[${id}]`).toBe(true);
  });
});

describe("the same overstatement elsewhere", () => {
  it.each(["app/real-estate-agent-tax-planning-canada/page.tsx", "app/tools/realtor-tax-estimator/page.tsx"])(
    "%s: CRA describes a logbook as the best evidence; it doesn't 'require' one",
    (rel) => {
      expect(source(rel)).not.toMatch(/CRA requires a (detailed mileage )?log/i);
      expect(source(rel)).not.toMatch(/most commonly audited/i);
    },
  );
});
