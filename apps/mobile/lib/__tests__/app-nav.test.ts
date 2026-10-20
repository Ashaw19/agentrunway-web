/**
 * The phone app's addresses (lib/app-nav.ts) after the 2026-10-20 navigation
 * cleanup: every link the app holds opens a screen that exists, the screens
 * that moved into the Money tab aren't linked at their old addresses, and the
 * small rules (the Money view param, tab badges) hold.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADD_ACTIONS, ADD_TARGET, MONEY_VIEWS, NAV, moneyView, tabBadge } from "../app-nav";
import { ACTION_ROUTES, MESSAGES_ROUTES, SECTION_ROUTES } from "../next-up-view";

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APP = path.join(MOBILE, "app/(app)");

/** The route file an href opens, or null: tabs first, then the screens pushed over them. */
function routeFile(href: string): string | null {
  const route = href.split("?")[0].replace(/^\/+|\/+$/g, "");
  const candidates = route === ""
    ? [path.join(APP, "(tabs)/index.tsx")]
    : [
        path.join(APP, "(tabs)", `${route}.tsx`),
        path.join(APP, `${route}.tsx`),
        path.join(APP, route, "index.tsx"),
      ];
  return candidates.find((file) => existsSync(file)) ?? null;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === "__tests__") return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("every address opens a screen that exists", () => {
  it("NAV and the + sheet's targets", () => {
    for (const href of [...Object.values(NAV), ...Object.values(ADD_TARGET)]) {
      expect(routeFile(href), href).not.toBeNull();
    }
  });

  it("the dashboard's rows and card buttons", () => {
    const hrefs = [...Object.values(SECTION_ROUTES), ...Object.values(MESSAGES_ROUTES), ...Object.values(ACTION_ROUTES)];
    for (const href of hrefs) expect(routeFile(href as string), href as string).not.toBeNull();
  });

  it("the five tabs are the tab layout's triggers, Search last with the system search role", () => {
    const layout = readFileSync(path.join(APP, "(tabs)/_layout.tsx"), "utf8");
    const names = [...layout.matchAll(/<NativeTabs\.Trigger name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(["index", "clients", "deals", "money", "search"]);
    expect(layout).toMatch(/<NativeTabs\.Trigger name="search" role="search"/);
    for (const name of names) expect(routeFile(name === "index" ? "/" : `/${name}`), name).not.toBeNull();
  });
});

describe("nothing links to where a screen used to be", () => {
  it("Expenses, Mileage and Forecast live in the Money tab; tabs aren't addressed through (app)", () => {
    const stale = /["'`]\/profile\/(expenses|mileage|forecast)\b|["'`]\/\(app\)\/(clients|deals|search)\b/;
    const offenders = [...sourceFiles(path.join(MOBILE, "app")), ...sourceFiles(path.join(MOBILE, "components")), ...sourceFiles(path.join(MOBILE, "lib"))]
      .filter((file) => stale.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(MOBILE, file));
    expect(offenders).toEqual([]);
  });
});

describe("screens pushed over the tabs", () => {
  // Briefing pushed "/deals" from the root stack and stacked a second copy
  // of the tabs on top of itself (review, 2026-10-20). A tab is reached from
  // a pushed screen by going back to the tabs: router.dismissTo.
  it("reach a tab with dismissTo, never by pushing or navigating to it", () => {
    const tabHref = /router\.(push|navigate|replace)\(\s*(\{\s*pathname:\s*)?(NAV\.(today|clients|deals|money|search|expenses|mileage|forecast|scanReceipt)\b|["'`]\/(clients|deals|money|search)?["'`?])/;
    const offenders = sourceFiles(path.join(APP, "profile"))
      .filter((file) => tabHref.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(MOBILE, file));
    expect(offenders).toEqual([]);
  });
});

describe("moneyView", () => {
  it("opens the view named, and Expenses for anything else", () => {
    for (const view of MONEY_VIEWS) expect(moneyView(view)).toBe(view);
    expect(moneyView(["mileage", "forecast"])).toBe("mileage");
    expect(moneyView(undefined)).toBe("expenses");
    expect(moneyView("receipts")).toBe("expenses");
  });
});

describe("tabBadge", () => {
  it("is empty at zero (hidden), the count up to 99, then 99+", () => {
    expect(tabBadge(0)).toBe("");
    expect(tabBadge(-3)).toBe("");
    expect(tabBadge(Number.NaN)).toBe("");
    expect(tabBadge(7)).toBe("7");
    expect(tabBadge(99)).toBe("99");
    expect(tabBadge(176)).toBe("99+");
  });
});

describe("the + sheet", () => {
  it("the sheet itself offers every action: the voice row, the log row, and a tile for each target", () => {
    const sheet = readFileSync(path.join(MOBILE, "components/add/AddButton.tsx"), "utf8");
    expect(sheet).toMatch(/<VoiceCaptureButton[\s\S]*?variant="inline"/);
    expect(sheet).toMatch(/pick\(\{ kind: "log" \}\)/);
    for (const action of Object.keys(ADD_TARGET)) expect(sheet, action).toMatch(new RegExp(`\\{ action: "${action}"`));
  });

  it("lists every way to add something, and each one that leaves the sheet has a target", () => {
    expect(ADD_ACTIONS).toEqual(["voice", "log", "receipt", "trip", "client", "deal"]);
    expect(Object.keys(ADD_TARGET).sort()).toEqual(["client", "deal", "receipt", "trip"]);
  });
});
