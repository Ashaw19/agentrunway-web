/**
 * Every home screen string in English and French Canadian
 * (packages/i18n/mobile/<locale>/home.json), every key en has, now and later.
 *
 * The app ships ten languages; this checks the two it needs (GUARDED_LOCALES,
 * decided 2026-10-20). The other eight stay as they are, unchecked, and a
 * string added later shows in English there. What this holds, for en and fr-CA:
 *   - every key en has is there, a non-empty string, and no key en doesn't
 *     have (a typo, a stale `_plural`). A missing key shows the English too.
 *   - a count key (en has `_one` / `_other`) carries the plural forms the
 *     language needs, as Intl.PluralRules names them (French `one` / `many` /
 *     `other`). i18next 24 asks the same rules, and each count key renders
 *     through the app's real i18n setup at a spread of counts, with no
 *     fallback to English
 *   - `{{placeholders}}` match en's. The one allowance: `{{count}}` may be
 *     left out of a zero / one / two form, for a language whose noun carries
 *     the number
 *   - fr-CA: no em dash or en dash; none of the words that read as advice
 *     (devriez, doit, recommandons and the like)
 *   - fr-CA is not a copy of the English: a value may match en's (ignoring
 *     case) only when nothing is left of it, once its {{placeholders}}, the
 *     names below, numbers and punctuation are taken out, but words French
 *     keeps in English (KEPT_IN_ENGLISH)
 *   - the names stay as the files treat them: where en's value names one,
 *     fr-CA's names it too (it has French names for two)
 *   - no `_plural` key is left in any phone file, in all ten languages
 *     (i18next 24 never reads one)
 *
 * Mocked: the device locale (expo-localization) and saved storage (lib/mmkv),
 * so lib/i18n.ts loads under Node.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
// The vi.mock calls below are hoisted over this import, so i18n loads the mocks.
import i18n from "../i18n";
import { GUARDED_LOCALES, SHIPPED_LOCALES } from "./guarded-locales";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-CA" }] }));
vi.mock("../mmkv", () => ({ storage: { getString: () => undefined, set: () => {} } }));

type Tree = { [key: string]: string | Tree };
type Category = "zero" | "one" | "two" | "few" | "many" | "other";
type Translate = (key: string, options?: Record<string, unknown>) => string;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const I18N_MOBILE = path.resolve(HERE, "../../../../packages/i18n/mobile");
const LOCALES = readdirSync(I18N_MOBILE, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

/**
 * Names every file keeps as they are: the product names, and "Runway" in the
 * Runway Score's name (fr-CA "Score Runway").
 */
const NAMES = ["Agent Runway", "Next up", "Flight Control", "Flight Crew", "Hangar", "Runway"] as const;

/** The two names fr-CA says in French, as its Quick Access row and Next up title already did. */
const FRENCH_NAMES: Record<string, string> = { "Flight Control": "Contrôle de vol", "Next up": "Prochaine tâche" };

/**
 * Words French uses in English, the way agents in Quebec say them. A value
 * that matches en's passes only when every word left in it is on this list.
 */
const KEPT_IN_ENGLISH: Record<string, readonly string[]> = {
  // Quebec French writes these the same: Pipeline, Clients, Type, Notes, Briefing.
  "fr-CA": ["pipeline", "client", "clients", "type", "notes", "note", "briefing"],
};

/** French words that read as advice: should, must, recommend, advise. */
const ADVICE_FR = /\b(?:devriez|devrait|devez|doit|doivent|recommand\w*|conseill\w*)\b/i;

/** Counts that land in every plural form of en and fr-CA (French many is a million and up). */
const COUNTS = [0, 1, 2, 3, 4, 5, 6, 10, 11, 12, 21, 22, 100, 101, 102, 1_000_000];

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === "string") out.set(`${prefix}${k}`, v);
    else for (const [kk, vv] of flatten(v, `${prefix}${k}.`)) out.set(kk, vv);
  }
  return out;
}

function readTree(locale: string, file: string): Tree {
  return JSON.parse(readFileSync(path.join(I18N_MOBILE, locale, file), "utf8")) as Tree;
}

const flat = new Map(GUARDED_LOCALES.map((l) => [l, flatten(readTree(l, "home.json"))]));
const EN = flat.get("en") as Map<string, string>;

/** The plural forms a language needs, as the runtime names them (i18next 24 asks the same Intl.PluralRules). */
function categories(locale: string): Category[] {
  const order: Category[] = ["zero", "one", "two", "few", "many", "other"];
  const have = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
  return order.filter((c) => have.has(c));
}

const PLURAL_KEY = /^(.+)_(zero|one|two|few|many|other)$/;

interface Wanted {
  /** The key the locale must have. */
  key: string;
  /** The en key it is checked against: its placeholders, and whether it is a copy. */
  ref: string;
  /** The plural form, or null for a key with no count. */
  cat: Category | null;
}

/** Every key a locale needs, from en's: a count key becomes the forms the language has. */
function wantedKeys(locale: string): Wanted[] {
  const out: Wanted[] = [];
  const bases = new Set<string>();
  for (const key of EN.keys()) {
    const m = PLURAL_KEY.exec(key);
    if (m && (m[2] === "one" || m[2] === "other")) {
      if (bases.has(m[1])) continue;
      bases.add(m[1]);
      for (const cat of categories(locale)) out.push({ key: `${m[1]}_${cat}`, ref: `${m[1]}_${cat === "one" ? "one" : "other"}`, cat });
    } else {
      out.push({ key, ref: key, cat: null });
    }
  }
  return out;
}

function placeholders(value: string): string[] {
  return [...new Set([...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))].sort();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The words left in a value once its placeholders, the names, numbers and punctuation are out. */
function wordsLeft(value: string): string[] {
  let rest = value.replace(/\{\{[^}]*\}\}/g, " ");
  // Longest first, so "Agent Runway" goes before "Runway".
  for (const name of [...NAMES].sort((a, b) => b.length - a.length)) rest = rest.replace(new RegExp(escape(name), "gi"), " ");
  return rest.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
}

/** Whether a value that matches en's may: true when every word left in it is one its language keeps in English. */
function keptInEnglish(locale: string, value: string): boolean {
  const kept = new Set(KEPT_IN_ENGLISH[locale] ?? []);
  return wordsLeft(value).every((w) => kept.has(w));
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

describe("home.json, en and fr-CA", () => {
  it("knows every locale the app ships, and checks en and fr-CA among them", () => {
    expect(LOCALES).toEqual([...SHIPPED_LOCALES]);
    for (const locale of GUARDED_LOCALES) expect(LOCALES).toContain(locale);
  });

  it("plural forms follow the runtime: English two, French three", () => {
    expect(categories("en")).toEqual(["one", "other"]);
    expect(categories("fr-CA")).toEqual(["one", "many", "other"]);
  });

  it("en's count keys each have _one and _other", () => {
    const keys = [...EN.keys()];
    const bases = [...new Set(keys.filter((k) => PLURAL_KEY.test(k)).map((k) => (PLURAL_KEY.exec(k) as RegExpExecArray)[1]))];
    expect(bases.length).toBeGreaterThanOrEqual(6);
    for (const base of bases) expect([`${base}_one`, `${base}_other`].filter((k) => !keys.includes(k)), base).toEqual([]);
  });

  it("the guard catches an English copy, and lets the kept words through", () => {
    expect(keptInEnglish("fr-CA", "Good morning")).toBe(false);
    expect(keptInEnglish("fr-CA", "RUNWAY SCORE")).toBe(false);
    expect(keptInEnglish("fr-CA", "See all")).toBe(false);
    expect(keptInEnglish("fr-CA", "NEXT UP")).toBe(true);
    expect(keptInEnglish("fr-CA", "{{greeting}}, {{name}}")).toBe(true);
    expect(keptInEnglish("fr-CA", "/100")).toBe(true);
    expect(keptInEnglish("fr-CA", "PIPELINE")).toBe(true);
    expect(keptInEnglish("fr-CA", "Notes")).toBe(true);
  });
});

describe.each(GUARDED_LOCALES)("%s", (locale) => {
  const mine = flat.get(locale) as Map<string, string>;
  const wanted = wantedKeys(locale);

  it("has every key en has, with the plural forms its language needs, and no other", () => {
    const missing = wanted.filter((w) => !(typeof mine.get(w.key) === "string" && (mine.get(w.key) as string).trim() !== "")).map((w) => w.key);
    const known = new Set(wanted.map((w) => w.key));
    const extra = [...mine.keys()].filter((k) => !known.has(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it("keeps en's {{placeholders}}", () => {
    const bad: string[] = [];
    for (const w of wanted) {
      const value = mine.get(w.key);
      if (typeof value !== "string") continue; // the test above names it
      const expected = placeholders(EN.get(w.ref) as string);
      const actual = placeholders(value);
      // A zero / one / two form may state the number in the noun and leave {{count}} out.
      const countOptional = w.cat === "zero" || w.cat === "one" || w.cat === "two";
      const compare = countOptional && !actual.includes("count") ? [...actual, "count"].sort() : actual;
      if (compare.join("|") !== expected.join("|")) bad.push(`${w.key}: ${actual.join(",") || "none"} (en: ${expected.join(",") || "none"})`);
    }
    expect(bad).toEqual([]);
  });

  if (locale === "en") return;
  // From here, fr-CA.

  it("has no em dash, no en dash and no word that reads as advice", () => {
    const bad: string[] = [];
    for (const [key, value] of mine) {
      if (/[—–]/.test(value)) bad.push(`${key}: dash in "${value}"`);
      if (ADVICE_FR.test(value)) bad.push(`${key}: advice in "${value}"`);
    }
    expect(bad).toEqual([]);
  });

  it("is translated, not a copy of the English", () => {
    const copies: string[] = [];
    for (const w of wanted) {
      const value = mine.get(w.key);
      const enValue = EN.get(w.ref);
      if (typeof value !== "string" || typeof enValue !== "string") continue;
      if (same(value, enValue) && !keptInEnglish(locale, value)) copies.push(`${w.key}: "${value}"`);
    }
    expect(copies).toEqual([]);
  });

  it("keeps the names as the files treat them", () => {
    const bad: string[] = [];
    for (const w of wanted) {
      const value = mine.get(w.key);
      const enValue = EN.get(w.ref);
      if (typeof value !== "string" || typeof enValue !== "string") continue;
      for (const name of NAMES) {
        if (!enValue.toLowerCase().includes(name.toLowerCase())) continue;
        if (name === "Runway" && /agent runway/i.test(enValue)) continue;
        const want = FRENCH_NAMES[name] ?? name;
        if (!value.toLowerCase().includes(want.toLowerCase())) bad.push(`${w.key}: "${value}" has no "${want}"`);
      }
    }
    expect(bad).toEqual([]);
    expect(mine.get("score.runwayScore"), locale).toMatch(/Runway/);
    expect(mine.get("quickAccess.outreach"), locale).toBe("Contrôle de vol");
  });

  it("renders every count key at a spread of counts, in its own language", () => {
    const t = i18n.getFixedT(locale, "home") as unknown as Translate;
    const rules = new Intl.PluralRules(locale);
    const bases = [...new Set(wanted.filter((w) => w.cat).map((w) => w.key.replace(/_[a-z]+$/, "")))];
    expect(bases.length).toBeGreaterThanOrEqual(6);
    const bad: string[] = [];
    for (const base of bases) {
      // Every other placeholder en's string has gets a value too ({{address}} in a deal's closing line).
      const vars = Object.fromEntries(placeholders(EN.get(`${base}_other`) as string).filter((p) => p !== "count").map((p) => [p, `<${p}>`]));
      for (const count of COUNTS) {
        // fallbackLng: false, so a missing form shows as the key, not as English.
        const out = t(base, { ...vars, count, fallbackLng: false });
        const form = mine.get(`${base}_${rules.select(count)}`) as string;
        if (out === base || out.includes("{{")) bad.push(`${base} at ${count}`);
        else if (/\{\{\s*count\s*\}\}/.test(form) && !out.includes(String(count))) bad.push(`${base} at ${count}: no count in "${out}"`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("no `_plural` key is left in a phone file", () => {
  const files = LOCALES.flatMap((l) =>
    readdirSync(path.join(I18N_MOBILE, l)).filter((f) => f.endsWith(".json")).map((f) => [l, f] as const));

  it("looks at every locale's files", () => {
    expect(files.length).toBe(LOCALES.length * 6);
  });

  it.each(files)("%s/%s", (locale, file) => {
    const keys = [...flatten(readTree(locale, file)).keys()];
    expect(keys.filter((k) => /_plural$/.test(k))).toEqual([]);
  });

  it("the count keys read right through i18next in en: 1 is singular, 2 is plural", () => {
    const t = i18n.getFixedT("en", "home") as unknown as Translate;
    expect(t("sync.pendingSync", { count: 1 })).toBe("1 change pending sync");
    expect(t("sync.pendingSync", { count: 2 })).toBe("2 changes pending sync");
    expect(t("briefing.itemCount", { count: 1 })).toBe("1 item");
    expect(t("briefing.itemCount", { count: 3 })).toBe("3 items");
    expect(t("metrics.deals", { count: 1 })).toBe("1 deal");
    expect(t("metrics.deals", { count: 4 })).toBe("4 deals");
    expect(t("metrics.needFollowUp", { count: 1 })).toBe("1 needs follow-up");
    expect(t("metrics.needFollowUp", { count: 2 })).toBe("2 need follow-up");
  });
});
