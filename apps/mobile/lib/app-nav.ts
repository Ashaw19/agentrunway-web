/**
 * Where things live in the phone app, in one place (2026-10-20 navigation
 * cleanup: docs/superpowers/specs/2026-10-20-phone-navigation-design.md).
 *
 * Tabs: Today, Clients, Deals, Money, Search. Every other screen is pushed
 * over them from app/(app)/profile/. A link to a screen goes through here so
 * a screen that moves changes one line; lib/__tests__/app-nav.test.ts checks
 * each address against the route files.
 *
 * Pure: no React, no router.
 */

/** The three views behind the Money tab's segmented control. */
export const MONEY_VIEWS = ["expenses", "mileage", "forecast"] as const;
export type MoneyView = (typeof MONEY_VIEWS)[number];

/** A `view` route param to a Money view; anything else opens Expenses. */
export function moneyView(param: string | string[] | undefined): MoneyView {
  const value = Array.isArray(param) ? param[0] : param;
  return (MONEY_VIEWS as readonly string[]).includes(value ?? "") ? (value as MoneyView) : "expenses";
}

export const NAV = {
  today: "/",
  clients: "/clients",
  deals: "/deals",
  search: "/search",
  money: "/money",
  expenses: "/money?view=expenses",
  mileage: "/money?view=mileage",
  forecast: "/money?view=forecast",
  /** Opens the receipt camera on the Expenses view. */
  scanReceipt: "/money?view=expenses&scan=1",
  /** You: settings only, from your initials on Today. */
  you: "/profile",
  checklist: "/profile/checklist",
  briefing: "/profile/briefing",
  outreach: "/profile/outreach",
  flightCrew: "/profile/chat",
  aiActivity: "/profile/ai-activity",
  contactsFill: "/profile/contacts-fill",
  contactsImport: "/profile/contacts-import",
  goals: "/profile/settings",
  businessIdentity: "/profile/business-identity",
  voiceQuiz: "/profile/voice-quiz",
  notifications: "/profile/notification-settings",
  legal: "/profile/legal",
} as const;

/** A tab badge's text: empty (hidden) at zero, "99+" past 99. */
export function tabBadge(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > 99 ? "99+" : String(Math.floor(count));
}

/**
 * The "+" sheet, in order. One place for adding anything (Things 3's Magic
 * Plus; Follow Up Boss's quick actions). `voice` records in the sheet; the
 * rest open a form or a screen. No to-do yet: the phone's Checklist can't
 * add one.
 */
export const ADD_ACTIONS = ["voice", "log", "receipt", "trip", "client", "deal"] as const;
export type AddAction = (typeof ADD_ACTIONS)[number];

/** Where an add action that opens a screen goes. `log` and `voice` stay in the sheet. */
export const ADD_TARGET: Record<Exclude<AddAction, "log" | "voice">, string> = {
  receipt: NAV.scanReceipt,
  trip: NAV.mileage,
  client: `${NAV.clients}?add=1`,
  deal: `${NAV.deals}?add=1`,
};
