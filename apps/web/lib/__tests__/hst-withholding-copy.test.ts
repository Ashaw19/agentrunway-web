/**
 * "Does your brokerage withhold HST?" reads the same on every screen that
 * asks it and says what the app does with the answer, and the blog states
 * CRA's small supplier rule as CRA does (2026-10-13).
 *
 * What was wrong:
 *   - Settings: "We won't include HST in your set-aside recommendations" and
 *     "We'll remind you to set it aside for CRA". Two directives on a tax
 *     surface.
 *   - Onboarding: its own answer labels, "This changes how we calculate your
 *     take-home pay" (it doesn't: the setting only zeroes computeHSTCollected,
 *     and so the HST taken off the cash position), and "Nice — one less thing
 *     to worry about."
 *   - Blog, "The Real Cost of a Real Estate Deal": registered "almost
 *     certainly ... if you're earning above $30,000 annually". The limit is
 *     revenue from taxable supplies in a single calendar quarter or over four
 *     consecutive calendar quarters.
 *
 * The wording lives in `@agent-runway/core/tax-copy` (cra-rules.ts) and is
 * tested there string by string. This file proves the screens print it. Both
 * screens are client components behind sign-in, so they are read as source,
 * the way pdf-tax-copy.test.ts reads the Reports page.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SMALL_SUPPLIER_RULE, validateTaxCopy } from "@agent-runway/core/tax-copy";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error");

describe.each(["app/(app)/settings/settings-content.tsx", "app/onboarding/page.tsx"])(
  "%s: brokerage HST withholding question",
  (rel) => {
    const text = source(rel);

    it("prints the shared question, answers and hint", () => {
      expect(text).toContain("{BROKERAGE_HST_WITHHOLDING.question}");
      expect(text).toContain("{BROKERAGE_HST_WITHHOLDING.no}");
      expect(text).toContain("{BROKERAGE_HST_WITHHOLDING.yes}");
      expect(text).toContain("{brokerageHstWithholdingHint(brokerageWithholdsHst)}");
    });

    it("retypes none of it, and keeps none of the old wording", () => {
      expect(text).not.toMatch(/withhold HST from your commission cheques/);
      expect(text).not.toMatch(/set-aside recommendations/i);
      expect(text).not.toMatch(/set it aside/i);
      expect(text).not.toMatch(/take-home pay and your estimated HST/i);
      expect(text).not.toMatch(/one less thing/i);
    });
  },
);

describe("blog: the real cost of a real estate deal", () => {
  const post = source("content/blog/the-real-cost-of-a-real-estate-deal.mdx");
  const paragraph = post.split("\n").find((line) => line.includes("$30,000")) ?? "";

  it("states the small supplier rule in the shared wording", () => {
    expect(paragraph).toContain(SMALL_SUPPLIER_RULE);
  });

  it("links the CRA page the rule comes from", () => {
    expect(paragraph).toContain(
      "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html",
    );
  });

  it("no longer reads registration off yearly earnings", () => {
    expect(post).not.toMatch(/almost certainly/i);
    expect(post).not.toMatch(/\$30,000 annually/);
  });

  it("the paragraph has no advice wording and no em dash", () => {
    expect(errorsIn(paragraph)).toEqual([]);
    expect(paragraph).not.toContain("—");
  });
});
