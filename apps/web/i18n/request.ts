import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // Resolve the locale from the middleware or fall back to the default
  let locale = await requestLocale;
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
