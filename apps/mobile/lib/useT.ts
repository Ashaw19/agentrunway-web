/**
 * Convenience hook wrapping react-i18next's useTranslation.
 *
 * Provides a typed `t` function, the current locale, and
 * a locale-aware currency formatter.
 */

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

type Namespace = "common" | "home" | "clients" | "deals" | "profile" | "auth";

/**
 * Typed translation hook for the mobile app.
 *
 * @param ns  Namespace or namespaces to load (defaults to "common")
 *
 * @example
 *   const { t, locale, formatCurrency } = useT("deals");
 *   <Text>{t("title")}</Text>
 *   <Text>{formatCurrency(125000)}</Text>
 */
export function useT(ns: Namespace | Namespace[] = "common") {
  const { t, i18n } = useTranslation(ns);

  const locale = i18n.language;

  /**
   * Format a number as currency respecting the current locale.
   * Uses Canadian dollars (CAD) since this is a Canadian real estate app.
   */
  function formatCurrency(amount: number, compact = false): string {
    try {
      if (compact) {
        if (amount >= 1_000_000) {
          return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: "CAD",
            notation: "compact",
            maximumFractionDigits: 1,
          }).format(amount);
        }
        if (amount >= 1_000) {
          return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: "CAD",
            notation: "compact",
            maximumFractionDigits: 0,
          }).format(amount);
        }
      }

      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "CAD",
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      // Fallback for environments without full Intl support
      return `$${Math.round(amount).toLocaleString()}`;
    }
  }

  return {
    t: t as TFunction,
    locale,
    i18n,
    formatCurrency,
  };
}
