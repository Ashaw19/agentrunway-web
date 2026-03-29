/**
 * @agent-runway/i18n — Shared internationalization utilities
 *
 * Supports 10 locales covering the major language communities
 * across Canada's real estate industry.
 */

// ── Supported Locales ──────────────────────────────────────────────────────────

export const SUPPORTED_LOCALES = [
  "en",     // English
  "fr-CA",  // Canadian French
  "zh",     // Mandarin Chinese (Simplified)
  "pa",     // Punjabi (Gurmukhi)
  "yue",    // Cantonese (Traditional Chinese)
  "es",     // Spanish
  "tl",     // Tagalog / Filipino
  "ar",     // Arabic
  "hi",     // Hindi
  "ur",     // Urdu
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// ── RTL Locales ────────────────────────────────────────────────────────────────

export const RTL_LOCALES: SupportedLocale[] = ["ar", "ur"];

/** Returns true if the given locale uses right-to-left text direction. */
export function isRTL(locale: string): boolean {
  return RTL_LOCALES.includes(locale as SupportedLocale);
}

// ── Locale Display Names ───────────────────────────────────────────────────────

const LOCALE_NAMES: Record<SupportedLocale, string> = {
  en:      "English",
  "fr-CA": "Fran\u00e7ais (Canada)",
  zh:      "\u4e2d\u6587\uff08\u7b80\u4f53\uff09",
  pa:      "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40",
  yue:     "\u4e2d\u6587\uff08\u7e41\u9ad4\uff09",
  es:      "Espa\u00f1ol",
  tl:      "Tagalog",
  ar:      "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
  hi:      "\u0939\u093f\u0928\u094d\u0926\u0940",
  ur:      "\u0627\u0631\u062f\u0648",
};

/** Returns the native display name for a supported locale. */
export function getLocaleName(locale: SupportedLocale): string {
  return LOCALE_NAMES[locale] ?? locale;
}

// ── Locale Matching ────────────────────────────────────────────────────────────

/**
 * Maps a device/browser locale code to the closest supported locale.
 *
 * Examples:
 *   "fr-CA"  → "fr-CA"
 *   "fr"     → "fr-CA"
 *   "zh-CN"  → "zh"
 *   "zh-HK"  → "yue"
 *   "zh-TW"  → "yue"
 *   "pa-Guru" → "pa"
 *   "es-MX"  → "es"
 *   "fil"    → "tl"
 *   "en-US"  → "en"
 *   "de"     → "en" (fallback)
 */
export function getClosestLocale(deviceLocale: string): SupportedLocale {
  if (!deviceLocale) return "en";

  const normalized = deviceLocale.trim().toLowerCase();

  // Exact match
  const exactMatch = SUPPORTED_LOCALES.find(
    (l) => l.toLowerCase() === normalized,
  );
  if (exactMatch) return exactMatch;

  // Filipino / Tagalog aliases
  if (normalized === "fil" || normalized.startsWith("fil-") || normalized.startsWith("tl-")) {
    return "tl";
  }

  // Chinese variants — map HK/TW/Hant to Cantonese, otherwise Mandarin
  if (normalized.startsWith("zh")) {
    if (
      normalized.includes("hk") ||
      normalized.includes("tw") ||
      normalized.includes("hant") ||
      normalized.includes("yue")
    ) {
      return "yue";
    }
    return "zh";
  }

  // Cantonese explicit
  if (normalized.startsWith("yue")) return "yue";

  // French — all French variants map to fr-CA (this is a Canadian app)
  if (normalized.startsWith("fr")) return "fr-CA";

  // Primary language code match
  const primaryLang = normalized.split("-")[0];
  const langMatch = SUPPORTED_LOCALES.find(
    (l) => l.toLowerCase().split("-")[0] === primaryLang,
  );
  if (langMatch) return langMatch;

  // Fallback to English
  return "en";
}
