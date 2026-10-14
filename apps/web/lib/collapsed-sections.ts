/**
 * Which sections of a page are minimized to their title bar, remembered per
 * browser in a cookie.
 *
 * A cookie, not localStorage: the page's server component reads it and
 * renders the sections already collapsed, so nothing opens and then snaps
 * shut after the page loads. It is a layout preference only: no figure on
 * the page depends on it.
 */

/** Every section on the Expenses page that can be minimized, in page order. */
export const EXPENSES_SECTIONS = [
  "gst-return",
  "brokerage-statement",
  "tax-deductible",
  "tax-iq",
  "year-over-year",
  "expense-ratio",
  "categories",
  "recurring",
  "receipts",
  "trip-log",
] as const;

export type ExpensesSection = (typeof EXPENSES_SECTIONS)[number];

export const EXPENSES_COLLAPSED_COOKIE = "ar_expenses_collapsed";

/**
 * Collapsed when the browser has no saved choice. Year-over-Year opened
 * closed before sections could be minimized, and still does.
 */
export const EXPENSES_COLLAPSED_BY_DEFAULT: readonly ExpensesSection[] = ["year-over-year"];

/** One year. */
export const COLLAPSED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The saved choice, or null when the browser has none. Unknown names are
 * dropped (a section renamed or removed since the cookie was written).
 */
export function parseCollapsedSections<T extends string>(
  value: string | null | undefined,
  known: readonly T[],
): T[] | null {
  if (value == null) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null; // not a value this app wrote
  }
  const names = new Set(decoded.split(",").map((s) => s.trim()));
  return known.filter((k) => names.has(k));
}

/** The cookie value for a set of collapsed sections, in page order. */
export function serializeCollapsedSections<T extends string>(
  collapsed: Iterable<T>,
  known: readonly T[],
): string {
  const set = new Set(collapsed);
  return encodeURIComponent(known.filter((k) => set.has(k)).join(","));
}

/** One section opened or minimized; the rest as they were. */
export function toggledSections<T extends string>(collapsed: ReadonlySet<T>, id: T): Set<T> {
  const next = new Set(collapsed);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Every section minimized, or none. */
export function everySection<T extends string>(known: readonly T[], collapsed: boolean): Set<T> {
  return new Set(collapsed ? known : []);
}

/** The `document.cookie` assignment that saves the choice. */
export function collapsedSectionsCookie(name: string, value: string): string {
  return `${name}=${value}; path=/; max-age=${COLLAPSED_COOKIE_MAX_AGE}; SameSite=Lax`;
}
