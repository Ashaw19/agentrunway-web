/**
 * Convenience wrappers around next-intl hooks for use across the web app.
 *
 * Usage (client components):
 *   import { useAppTranslations, useAppLocale } from "@/hooks/use-i18n";
 *   const t = useAppTranslations("common");    // typed namespace
 *   const locale = useAppLocale();
 *
 * The namespaces correspond to the JSON files loaded in i18n/request.ts:
 *   common, dashboard, settings, shared
 */

export { useTranslations as useAppTranslations } from "next-intl";
export { useLocale as useAppLocale } from "next-intl";
