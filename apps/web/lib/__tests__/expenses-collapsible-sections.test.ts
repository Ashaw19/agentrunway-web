/**
 * Every section on the Expenses page can be minimized to its title bar
 * (2026-10-14), and the choice is remembered in the browser.
 *
 * Three checks:
 *   1. The saved choice: the cookie the page's server component reads.
 *   2. The card: title always shown and the toggle; the rest hidden, not
 *      removed, while minimized.
 *   3. The page: every titled section is one of these cards, the server reads
 *      the cookie, and the AI knows the sections can be minimized.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLLAPSED_COOKIE_MAX_AGE,
  EXPENSES_COLLAPSED_BY_DEFAULT,
  EXPENSES_COLLAPSED_COOKIE,
  EXPENSES_SECTIONS,
  collapsedSectionsCookie,
  everySection,
  parseCollapsedSections,
  serializeCollapsedSections,
  toggledSections,
} from "@/lib/collapsed-sections";
import { CollapsibleCard } from "@/components/collapsible-card";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { getPlaybooks } from "@/lib/troubleshooting-playbooks";
import { classifyTopicMulti } from "@/lib/troubleshooting-classifier";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../..");
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

// ─────────────────────────────────────────────────────────────────────────
// 1. The saved choice
// ─────────────────────────────────────────────────────────────────────────

describe("the cookie that remembers which sections are minimized", () => {
  it("no cookie is no saved choice, so the page's defaults apply", () => {
    expect(parseCollapsedSections(undefined, EXPENSES_SECTIONS)).toBeNull();
    expect(parseCollapsedSections(null, EXPENSES_SECTIONS)).toBeNull();
    expect(EXPENSES_COLLAPSED_BY_DEFAULT).toEqual(["year-over-year"]);
  });

  it("an empty cookie is a saved choice: everything open", () => {
    expect(parseCollapsedSections("", EXPENSES_SECTIONS)).toEqual([]);
  });

  it("round-trips in page order, whatever order the sections were minimized in", () => {
    const value = serializeCollapsedSections(["receipts", "gst-return", "categories"], EXPENSES_SECTIONS);
    expect(parseCollapsedSections(value, EXPENSES_SECTIONS)).toEqual(["gst-return", "categories", "receipts"]);
  });

  it("drops names it does not know (a section renamed or removed since)", () => {
    expect(parseCollapsedSections("receipts,old-section,,tax-iq", EXPENSES_SECTIONS)).toEqual(["tax-iq", "receipts"]);
  });

  it("a value this app did not write is ignored, not an error", () => {
    expect(parseCollapsedSections("%E0%A4%A", EXPENSES_SECTIONS)).toBeNull();
  });

  it("is a first-party cookie for the whole site, kept a year", () => {
    const cookie = collapsedSectionsCookie(EXPENSES_COLLAPSED_COOKIE, "receipts");
    expect(cookie).toBe(`ar_expenses_collapsed=receipts; path=/; max-age=${COLLAPSED_COOKIE_MAX_AGE}; SameSite=Lax`);
    expect(COLLAPSED_COOKIE_MAX_AGE).toBe(31_536_000);
  });

  it("toggling one section leaves the others as they were", () => {
    const start = new Set(["categories", "receipts"] as const);
    const opened = toggledSections<(typeof EXPENSES_SECTIONS)[number]>(start, "receipts");
    expect([...opened]).toEqual(["categories"]);
    const closed = toggledSections<(typeof EXPENSES_SECTIONS)[number]>(opened, "tax-iq");
    expect([...closed].sort()).toEqual(["categories", "tax-iq"]);
    expect([...start]).toEqual(["categories", "receipts"]); // not changed in place
  });

  it("collapse all and expand all cover every section, the Mileage tab's included", () => {
    expect([...everySection(EXPENSES_SECTIONS, true)]).toEqual([...EXPENSES_SECTIONS]);
    expect(everySection(EXPENSES_SECTIONS, false).size).toBe(0);
    expect(EXPENSES_SECTIONS).toContain("trip-log");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The card
// ─────────────────────────────────────────────────────────────────────────

const render = (collapsed: boolean) =>
  renderToStaticMarkup(
    createElement(
      CollapsibleCard,
      {
        id: "expenses-recurring",
        collapsed,
        onToggle: () => {},
        title: "Recurring Expenses",
        description: "Expenses that repeat on a schedule",
        aside: createElement("button", { type: "button" }, "Add Recurring"),
      },
      createElement("p", null, "THE BODY"),
    ),
  );

describe("a minimizable card", () => {
  it("open: title, description, header buttons and body", () => {
    const html = render(false);
    expect(html).toContain("Recurring Expenses");
    expect(html).toContain("Expenses that repeat on a schedule");
    expect(html).toContain("Add Recurring");
    expect(html).toMatch(/<div id="expenses-recurring-body" class="contents">\s*<p>THE BODY<\/p>/);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="expenses-recurring-body"');
    expect(html).toContain('data-collapsed="false"');
  });

  it("minimized: the title only, with the toggle", () => {
    const html = render(true);
    expect(html).toContain("Recurring Expenses");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Expenses that repeat on a schedule");
    expect(html).not.toContain("Add Recurring");
    expect(html).toContain('data-collapsed="true"');
  });

  it("minimized: the body is hidden, not removed, so what was typed in it is still there", () => {
    const html = render(true);
    expect(html).toMatch(/<div id="expenses-recurring-body" hidden="">\s*<p>THE BODY<\/p>/);
    // No display class on the hidden body: it would override the attribute.
    expect(html).not.toMatch(/id="expenses-recurring-body"[^>]*class=/);
  });

  it("the toggle is a button inside the heading", () => {
    const html = render(false);
    expect(html).toMatch(/data-slot="card-title"[^>]*><button type="button"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The page
// ─────────────────────────────────────────────────────────────────────────

describe("the Expenses page", () => {
  const content = source("app/(app)/expenses/expenses-content.tsx");
  const mileage = source("app/(app)/expenses/expenses-mileage-tab.tsx");
  const page = source("app/(app)/expenses/page.tsx");

  it.each(EXPENSES_SECTIONS)("%s is a minimizable card", (id) => {
    expect(content.split(`section("${id}")`).length - 1, id).toBe(1);
  });

  it("no section on the Receipts tab has a title bar of its own outside the card", () => {
    expect(content).not.toMatch(/<CardTitle\b/);
    expect(content).not.toMatch(/<CardHeader\b/);
    // Year-over-Year's own open/close toggle is gone; it uses the shared one.
    expect(content).not.toMatch(/yoyExpanded/);
  });

  it("the Mileage tab's Trip Log is one too; only the Log a Trip form keeps a plain title", () => {
    expect(content).toContain('tripLogSection={section("trip-log")}');
    expect(mileage).toMatch(/<CollapsibleCard\b[\s\S]{0,200}tripLogSection\?\.collapsed/);
    const plainTitles = [...mileage.matchAll(/<CardTitle[^>]*>([^<]*)</g)].map((m) => m[1].trim());
    expect(plainTitles).toEqual(["Log a Trip"]);
  });

  it("has Collapse all / Expand all beside the tabs", () => {
    expect(content).toContain('sections.allCollapsed ? "Expand all sections" : "Collapse all sections"');
    expect(content).toContain("onClick={() => sections.setAll(!sections.allCollapsed)}");
  });

  it("the server reads the cookie, so minimized sections render minimized", () => {
    expect(page).toMatch(/import \{ cookies \} from "next\/headers";/);
    expect(page).toContain("(await cookies()).get(EXPENSES_COLLAPSED_COOKIE)?.value");
    expect(page).toContain("initialCollapsedSections={collapsedSections}");
    expect(content).toContain("initial: initialCollapsedSections ?? EXPENSES_COLLAPSED_BY_DEFAULT");
  });
});

describe("the AI knows sections can be minimized", () => {
  it("the knowledge base names it on the Expenses page", () => {
    expect(KNOWLEDGE_BASE).toMatch(/can be minimized to its title bar/);
    expect(KNOWLEDGE_BASE).toContain('"Collapse all sections" / "Expand all sections"');
  });

  it("the Expenses playbook answers 'where did my Receipt Log go'", () => {
    const playbook = getPlaybooks(["expenses"]);
    expect(playbook).toContain('"Where did my Receipt Log go?"');
    expect(playbook).toContain("Minimizing changes no figure");
  });

  it("those questions reach the Expenses playbook", () => {
    for (const question of [
      "where did my receipt log go",
      "how do I collapse all sections on the expenses page",
      "a minimized section won't open",
    ]) {
      expect(classifyTopicMulti(question).map((t) => t.topic), question).toContain("expenses");
    }
  });
});
