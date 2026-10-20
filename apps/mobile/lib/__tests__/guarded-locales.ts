/**
 * The phone languages the string guards check (home-locales.test.ts and
 * next-up-locales.test.ts): English and French Canadian.
 *
 * The app ships ten (packages/i18n/mobile). Decided 2026-10-20: only English
 * and French are needed. The other eight (ar, es, hi, pa, tl, ur, yue, zh)
 * stay as they are and are not checked. A string added later shows in
 * English there (lib/i18n.ts falls back to en), so a new string needs en and
 * fr-CA only.
 */
export const GUARDED_LOCALES = ["en", "fr-CA"] as const;

/** Every locale the app ships, checked or not. */
export const SHIPPED_LOCALES = ["ar", "en", "es", "fr-CA", "hi", "pa", "tl", "ur", "yue", "zh"] as const;
