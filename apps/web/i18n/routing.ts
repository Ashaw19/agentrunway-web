import { defineRouting } from "next-intl/routing";

export const locales = [
  "en",
  "fr-CA",
  "zh",
  "pa",
  "yue",
  "es",
  "tl",
  "ar",
  "hi",
  "ur",
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/**
 * Locales with complete translations that should appear in the language picker.
 * Add a locale here once its translation files are fully reviewed and approved.
 * All other locales still work (for testing) but are hidden from end users.
 */
export const pickerLocales: readonly Locale[] = ["en", "fr-CA"];

/** Locales that use right-to-left script direction. */
export const rtlLocales: ReadonlySet<Locale> = new Set(["ar", "ur"]);

/** Human-readable native names for the language picker. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  "fr-CA": "Fran\u00e7ais (Canada)",
  zh: "\u4e2d\u6587",
  pa: "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40",
  yue: "\u7cb5\u8a9e",
  es: "Espa\u00f1ol",
  tl: "Filipino",
  ar: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
  hi: "\u0939\u093f\u0928\u094d\u0926\u0940",
  ur: "\u0627\u0631\u062f\u0648",
};

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "never",
});
