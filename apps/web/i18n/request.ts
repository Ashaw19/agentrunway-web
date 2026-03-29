import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // 1. Try the locale passed by next-intl (if middleware ran)
  let locale = await requestLocale;

  // 2. Fall back to the NEXT_LOCALE cookie (set by language picker / onboarding)
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    const cookieStore = await cookies();
    locale = cookieStore.get("NEXT_LOCALE")?.value ?? undefined;
  }

  // 3. Fall back to Accept-Language header for first-time visitors
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    const headerStore = await headers();
    const acceptLang = headerStore.get("accept-language") ?? "";
    // Parse primary language tag (e.g. "fr-CA,fr;q=0.9,en;q=0.8" → "fr-CA")
    const primary = acceptLang.split(",")[0]?.split(";")[0]?.trim();
    if (primary && routing.locales.includes(primary as (typeof routing.locales)[number])) {
      locale = primary;
    }
  }

  // 4. Final fallback to default
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  // Load web-specific namespace files (common, dashboard, settings)
  // and a shared cross-platform file, then merge them all together.
  const [common, dashboard, settings, shared] = await Promise.all([
    import(`../../../packages/i18n/web/${locale}/common.json`).then((m) => m.default).catch(() => ({})),
    import(`../../../packages/i18n/web/${locale}/dashboard.json`).then((m) => m.default).catch(() => ({})),
    import(`../../../packages/i18n/web/${locale}/settings.json`).then((m) => m.default).catch(() => ({})),
    import(`../../../packages/i18n/shared/${locale}.json`).then((m) => m.default).catch(() => ({})),
  ]);

  return {
    locale,
    messages: {
      common,
      dashboard,
      settings,
      shared,
    },
  };
});
