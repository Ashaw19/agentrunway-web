/**
 * Tailwind classes for an expense ratio tone.
 *
 * The tone comes from `expenseRatioTone()` (EXPENSE_RATIO_BANDS in
 * packages/core/engines/expense-ratio-bands.ts): which band a ratio is in is
 * decided there, for every screen. This file only says what each tone looks
 * like on a web page, so no page re-encodes the cut-offs to pick a class.
 */
import type { ExpenseRatioTone } from "@agent-runway/core/engines/expense-ratio-bands";

export const EXPENSE_RATIO_TONE_CLASS: Record<
  ExpenseRatioTone,
  { text: string; value: string; bar: string; badge: string; icon: string }
> = {
  emerald: { text: "text-emerald-600", value: "text-emerald-700", bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", icon: "text-emerald-500" },
  blue:    { text: "text-blue-600",    value: "text-blue-700",    bar: "bg-blue-500",    badge: "bg-blue-100 text-blue-700",       icon: "text-blue-500" },
  amber:   { text: "text-amber-600",   value: "text-amber-700",   bar: "bg-amber-500",   badge: "bg-amber-100 text-amber-700",     icon: "text-amber-500" },
  red:     { text: "text-red-600",     value: "text-red-700",     bar: "bg-red-500",     badge: "bg-red-100 text-red-700",         icon: "text-red-500" },
  // No band: no GCI yet, or no expenses recorded.
  slate:   { text: "text-slate-600",   value: "text-slate-700",   bar: "bg-slate-400",   badge: "bg-slate-100 text-slate-700",     icon: "text-slate-400" },
};
