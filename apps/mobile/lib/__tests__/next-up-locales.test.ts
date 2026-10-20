/**
 * The Next up strings in all 10 phone languages (packages/i18n/mobile/<locale>/home.json).
 *
 * What this holds, for every locale the app ships:
 *   - every key en has under NEXT_UP_NAMESPACES is there, a non-empty string,
 *     and no extra key sits beside them (a typo, a stale `_plural`)
 *   - a count key (en has `_one` / `_other`) carries the plural forms the
 *     language needs, as Intl.PluralRules names them: Arabic six, French and
 *     Spanish `one` / `many` / `other`, Chinese and Cantonese `other` only.
 *     i18next 24 resolves exactly these (R23), and the count keys render
 *     through the app's real i18n setup at a spread of counts, with no
 *     fallback to English
 *   - `{{placeholders}}` match en's. The one allowance: `{{count}}` may be
 *     left out of a zero / one / two form, for a language whose noun carries
 *     the number (Arabic says "one task" and "two tasks" with the noun alone)
 *   - no em dash or en dash; none of the words that read as advice, in the
 *     language (should, must, recommend and their equivalents)
 *   - not a copy of the English: each value differs from en's, bar a short
 *     list of strings a language keeps in English
 *   - the product names stay as the files treat them: "Hangar" in the Hangar
 *     strings, "Flight Control" (fr-CA: "Contrôle de vol", as its Quick
 *     Access label) in the handful row
 *   - no `_plural` key is left anywhere in packages/i18n/mobile (the two old
 *     ones, sync.pendingSync and briefing.itemCount, are `_one` / `_other` now)
 *   - Later keeps its label beside Call and Text in every language, and turns
 *     round beside the two long task buttons (laterAsIcon, lib/next-up-copy.ts;
 *     Chinese and Cantonese name those buttons in four characters, so there it
 *     keeps its label)
 *
 * Mocked: the device locale (expo-localization) and saved storage (lib/mmkv),
 * so lib/i18n.ts loads under Node.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
// The vi.mock calls below are hoisted over these imports, so i18n loads the mocks.
import i18n from "../i18n";
import { actionLabel, laterAsIcon, type Translate } from "../next-up-copy";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-CA" }] }));
vi.mock("../mmkv", () => ({ storage: { getString: () => undefined, set: () => {} } }));

/** The home.json namespaces Tasks 9 to 11 added: the dashboard's welcome, cards, rows, sheets, toasts and score sheet. */
export const NEXT_UP_NAMESPACES = [
  "welcome", "stack", "alsoWaiting", "allClear", "cardActions", "later",
  "dismiss", "postCall", "nextUpToast", "textFlow", "scoreSheet", "yourNumbers",
] as const;

/** Count keys that were `_plural` before: outside the namespaces above, converted to `_one` / `_other` in this task. */
const CONVERTED_PLURAL_KEYS = ["sync.pendingSync", "briefing.itemCount"] as const;

/** home.json namespaces that were there before Tasks 9 to 11; a namespace in en that is in neither list fails the guard. */
const OLDER_NAMESPACES = [
  "greeting", "score", "scoreBar", "metrics", "actions", "sync", "streak", "briefing", "goal",
  "nextUp", "pipelinePreview", "quickAccess", "quickCapture",
] as const;

type Tree = { [key: string]: string | Tree };
type Category = "zero" | "one" | "two" | "few" | "many" | "other";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const I18N_MOBILE = path.resolve(HERE, "../../../../packages/i18n/mobile");
const LOCALES = readdirSync(I18N_MOBILE, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

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

const homes = new Map(LOCALES.map((l) => [l, readTree(l, "home.json")]));
const flat = new Map(LOCALES.map((l) => [l, flatten(homes.get(l) as Tree)]));

const inNextUp = (key: string) => (NEXT_UP_NAMESPACES as readonly string[]).includes(key.split(".")[0]);

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
  /** The en key whose placeholders it must match. */
  ref: string;
  /** The plural form, or null for a key with no count. */
  cat: Category | null;
}

/** Every key a locale needs, from en's keys that pass `scope`: a count key becomes the forms the language has. */
function wantedKeys(locale: string, scope: (key: string) => boolean): Wanted[] {
  const out: Wanted[] = [];
  const bases = new Set<string>();
  for (const key of (flat.get("en") as Map<string, string>).keys()) {
    if (!scope(key)) continue;
    const m = PLURAL_KEY.exec(key);
    if (m && (m[2] === "one" || m[2] === "other")) {
      if (bases.has(m[1])) continue;
      bases.add(m[1]);
      for (const cat of categories(locale)) out.push({ key: `${m[1]}_${cat}`, ref: `${m[1]}_other`, cat });
    } else {
      out.push({ key, ref: key, cat: null });
    }
  }
  return out;
}

const nextUpScope = (key: string) => inNextUp(key);
const convertedScope = (key: string) => (CONVERTED_PLURAL_KEYS as readonly string[]).some((b) => key === `${b}_one` || key === `${b}_other`);
/** The keys this task makes sure every locale has. */
const taskScope = (key: string) => nextUpScope(key) || convertedScope(key);

function placeholders(value: string): string[] {
  return [...new Set([...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))].sort();
}

/**
 * Words that read as advice, per language: should, must, recommend, advise.
 * (Spanish "debe", French "doit", Chinese "必须", Arabic "يجب", and so on.)
 */
const ADVICE: Record<string, RegExp> = {
  en: /\b(?:should|must|recommend\w*|advise\w*)\b/i,
  "fr-CA": /\b(?:devriez|devrait|devez|doit|doivent|recommand\w*|conseill\w*)\b/i,
  es: /\b(?:debes|debe|deben|deberías|debería|recomend\w*|aconsej\w*)\b/i,
  zh: /应该|应当|必须|建议|推荐|劝/,
  yue: /應該|應當|必須|建議|推薦|勸/,
  pa: /ਚਾਹੀਦ|ਸਲਾਹ|ਸਿਫ਼ਾਰਸ਼|ਸਿਫਾਰਸ਼|ਲਾਜ਼ਮੀ|ਜ਼ਰੂਰੀ ਹੈ/,
  tl: /\b(?:dapat|kailangan|rekomend\w*|inirerekomenda|payo)\b/i,
  ar: /يجب|ينبغي|نوصي|أوصي|توصي|توصية|ننصح|نصيحة|يُنصح|يستحسن/,
  hi: /चाहिए|चाहिये|सलाह|सिफ़ारिश|सिफारिश|अनिवार्य|ज़रूर करें|जरूर करें/,
  ur: /چاہیے|چاہئے|مشورہ|سفارش|لازمی|ضرور کریں/,
};

/**
 * Strings a language keeps the same as en's. Everything else must differ:
 * these files were English copies before this task, and the guard is what
 * stops one going back.
 */
const SAME_AS_EN_OK: Record<string, readonly string[]> = {
  // A greeting and a name, then punctuation; the product name "Next up" as the files treat it.
  "*": ["welcome.greeting", "stack.title"],
  // Filipino keeps these loan words the way realtors say them (a showing, an appointment, an item, a text).
  tl: [
    "alsoWaiting.checklist", "cardActions.text", "dismiss.text", "briefing.itemCount",
    "welcome.showingCount", "welcome.appointmentCount",
  ],
};

/** Counts that land in every plural form of every language here (Arabic zero to many, French and Spanish many). */
const COUNTS = [0, 1, 2, 3, 4, 5, 6, 10, 11, 12, 21, 22, 100, 101, 102, 1_000_000];

describe("the namespaces", () => {
  it("covers every locale the app ships", () => {
    expect(LOCALES).toEqual(["ar", "en", "es", "fr-CA", "hi", "pa", "tl", "ur", "yue", "zh"]);
  });

  it("names every namespace Tasks 9 to 11 added to en's home.json, and each is there", () => {
    const top = Object.keys(homes.get("en") as Tree);
    for (const ns of NEXT_UP_NAMESPACES) expect(top, ns).toContain(ns);
    const unlisted = top.filter(
      (ns) => !(NEXT_UP_NAMESPACES as readonly string[]).includes(ns) && !(OLDER_NAMESPACES as readonly string[]).includes(ns),
    );
    expect(unlisted, "a new home.json namespace needs adding to NEXT_UP_NAMESPACES, and translating").toEqual([]);
  });

  it("en has count keys in these namespaces, each with _one and _other", () => {
    const keys = [...(flat.get("en") as Map<string, string>).keys()].filter(nextUpScope);
    const bases = [...new Set(keys.filter((k) => k.endsWith("_one")).map((k) => k.slice(0, -4)))];
    expect(bases.length).toBeGreaterThan(10);
    for (const base of bases) expect(keys, base).toContain(`${base}_other`);
  });

  it("plural forms follow the runtime: Arabic six, French and Spanish three, Chinese and Cantonese one", () => {
    expect(categories("ar")).toEqual(["zero", "one", "two", "few", "many", "other"]);
    expect(categories("en")).toEqual(["one", "other"]);
    expect(categories("fr-CA")).toEqual(["one", "many", "other"]);
    expect(categories("es")).toEqual(["one", "many", "other"]);
    expect(categories("zh")).toEqual(["other"]);
    expect(categories("yue")).toEqual(["other"]);
  });
});

describe.each(LOCALES)("%s", (locale) => {
  const mine = flat.get(locale) as Map<string, string>;
  const en = flat.get("en") as Map<string, string>;
  const wanted = wantedKeys(locale, taskScope);

  it("has every key, with the plural forms its language needs, and no other under these namespaces", () => {
    const missing = wanted.filter((w) => !(typeof mine.get(w.key) === "string" && (mine.get(w.key) as string).trim() !== "")).map((w) => w.key);
    const known = new Set(wanted.map((w) => w.key));
    const extra = [...mine.keys()].filter((k) => nextUpScope(k) && !known.has(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it("has the converted count keys in the forms its language needs", () => {
    const keys = wantedKeys(locale, convertedScope).map((w) => w.key);
    expect(keys.length).toBe(CONVERTED_PLURAL_KEYS.length * categories(locale).length);
    for (const key of keys) expect(mine.get(key), key).toEqual(expect.any(String));
    for (const key of keys) expect((mine.get(key) as string).trim(), key).not.toBe("");
  });

  it("keeps en's {{placeholders}}", () => {
    const bad: string[] = [];
    for (const w of wanted) {
      const value = mine.get(w.key);
      if (typeof value !== "string") continue; // the test above names it
      const expected = placeholders(en.get(w.ref) as string);
      const actual = placeholders(value);
      // A zero / one / two form may state the number in the noun and leave {{count}} out.
      const countOptional = w.cat === "zero" || w.cat === "one" || w.cat === "two";
      const compare = countOptional && !actual.includes("count") ? [...actual, "count"].sort() : actual;
      if (compare.join("|") !== expected.join("|")) bad.push(`${w.key}: ${actual.join(",") || "none"} (en: ${expected.join(",") || "none"})`);
    }
    expect(bad).toEqual([]);
  });

  it("has no em dash, no en dash and no word that reads as advice", () => {
    const advice = ADVICE[locale];
    for (const w of wanted) {
      const value = mine.get(w.key);
      if (typeof value !== "string") continue;
      expect(value, `${locale} ${w.key}`).not.toMatch(/[—–]/);
      expect(value, `${locale} ${w.key}`).not.toMatch(advice);
    }
  });

  it("keeps product names as the files treat them", () => {
    for (const key of ["dismiss.hangar", "dismiss.hangarConfirmTitle", "dismiss.hangarConfirmBody", "nextUpToast.hangar"]) {
      expect(mine.get(key), `${locale} ${key}`).toContain("Hangar");
    }
    // fr-CA already calls it "Contrôle de vol" in its Quick Access row; every other file keeps "Flight Control".
    const flightControl = locale === "fr-CA" ? "Contrôle de vol" : "Flight Control";
    expect(mine.get("alsoWaiting.handfulDetail"), locale).toContain(flightControl);
    if (locale !== "en") expect(mine.get("stack.title"), locale).toBe(locale === "fr-CA" ? "PROCHAINE TÂCHE" : "NEXT UP");
  });

  if (locale !== "en") {
    it("is translated, not a copy of the English", () => {
      const allowed = new Set([...SAME_AS_EN_OK["*"], ...(SAME_AS_EN_OK[locale] ?? [])]);
      const copies: string[] = [];
      for (const w of wanted) {
        const value = mine.get(w.key);
        if (typeof value !== "string" || w.cat === "zero") continue;
        const base = w.cat ? w.key.replace(/_[a-z]+$/, "") : w.key;
        if (allowed.has(base)) continue;
        const enValue = en.get(w.cat ? `${base}_${w.cat === "one" ? "one" : "other"}` : w.key);
        if (value === enValue) copies.push(w.key);
      }
      expect(copies).toEqual([]);
    });
  }

  it("renders every count key at a spread of counts, in its own language", () => {
    const t = i18n.getFixedT(locale, "home") as unknown as Translate;
    const rules = new Intl.PluralRules(locale);
    const bases = [...new Set(wantedKeys(locale, taskScope).filter((w) => w.cat).map((w) => w.key.replace(/_[a-z]+$/, "")))];
    expect(bases.length).toBeGreaterThan(16);
    const bad: string[] = [];
    for (const base of bases) {
      for (const count of COUNTS) {
        // fallbackLng: false, so a missing form shows as the key, not as English.
        const out = t(base, { count, address: "12 Elm St", fallbackLng: false });
        const cat = rules.select(count) as Category;
        const form = mine.get(`${base}_${cat}`) as string;
        if (out === base || out.includes("{{")) bad.push(`${base} at ${count}`);
        else if (/\{\{\s*count\s*\}\}/.test(form) && !out.includes(String(count))) bad.push(`${base} at ${count}: no count in "${out}"`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("no `_plural` key is left", () => {
  const files = LOCALES.flatMap((l) =>
    readdirSync(path.join(I18N_MOBILE, l)).filter((f) => f.endsWith(".json")).map((f) => [l, f] as const));

  it("looks at every locale's files", () => {
    expect(files.length).toBe(LOCALES.length * 6);
  });

  it.each(files)("%s/%s", (locale, file) => {
    const keys = [...flatten(readTree(locale, file)).keys()];
    expect(keys.filter((k) => /_plural$/.test(k))).toEqual([]);
  });

  it("the converted count keys read right through i18next in en: 1 is singular, 2 is plural", () => {
    const t = i18n.getFixedT("en", "home") as unknown as Translate;
    expect(t("sync.pendingSync", { count: 1 })).toBe("1 change pending sync");
    expect(t("sync.pendingSync", { count: 2 })).toBe("2 changes pending sync");
    expect(t("briefing.itemCount", { count: 1 })).toBe("1 item");
    expect(t("briefing.itemCount", { count: 3 })).toBe("3 items");
  });
});

describe("Later beside the other buttons, in every language", () => {
  /**
   * The two task buttons ("Open checklist", "Mark one done") make Later turn
   * round when their labels run long. In Chinese and Cantonese each is four
   * characters, so the row fits with Later's label and it stays a label.
   */
  const LATER_STAYS_A_LABEL_BESIDE_TASK_BUTTONS = new Set(["zh", "yue"]);

  it.each(LOCALES)("%s: Later keeps its label beside Call and Text, and turns round beside long task buttons", (locale) => {
    const t = i18n.getFixedT(locale, "home") as unknown as Translate;
    expect(laterAsIcon(["call", "text", "later"], t), "call, text, later").toBe(false);
    expect(laterAsIcon(["call", "text", "later", "dismiss"], t), "call, text, later, dismiss").toBe(false);
    expect(laterAsIcon(["call", "later", "dismiss"], t), "call, later, dismiss").toBe(false);
    expect(laterAsIcon(["open_client", "later", "dismiss"], t), "open client, later, dismiss").toBe(false);
    expect(laterAsIcon(["open_deals", "later"], t), "open, later").toBe(false);
    expect(laterAsIcon(["record_voice_note", "later"], t), "record a note, later").toBe(false);
    expect(laterAsIcon(["open_checklist", "mark_one_done", "later"], t), "checklist buttons")
      .toBe(!LATER_STAYS_A_LABEL_BESIDE_TASK_BUTTONS.has(locale));
    for (const a of ["call", "text", "later", "dismiss", "open_checklist", "mark_one_done", "open_deals", "record_voice_note"] as const) {
      expect(actionLabel(a, t), `${locale} ${a}`).not.toMatch(/cardActions/);
    }
  });
});
