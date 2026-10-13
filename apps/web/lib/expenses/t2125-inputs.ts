/**
 * What the T2125 pre-fill is given from expense tracking.
 *
 * Built on expense-totals-engine, so for a GST/HST registrant every amount is
 * net of the input tax credits the GST34 summary claims.
 *
 *   expenseAmounts   by expense key, incurred to date:
 *                      receipts
 *                    + the legacy per-item monthly figure × completed months
 *                    + the Recurring Expenses list, occurrences to date
 *   homeOfficeCosts  Home Office bills by key, WHOLE (before the home office
 *                    share): the costs behind line 9945. Receipts plus any
 *                    recurring home bill.
 *
 * The Recurring Expenses list was missing from this until 2026-10-13: it
 * counted in YTD Expenses everywhere but never reached a T2125 line, so a
 * vehicle lease or board dues kept there were left out of the estimate.
 *
 * A recurring expense carries an expense ITEM key (vehicle_payment) when it
 * was filed under an item. One filed under a whole category carries the
 * category key, which has no T2125 line and is skipped by the engine, as a
 * custom expense item is.
 */
import {
  aggregateReceiptTotals,
  recurringNetOfItc,
  type ExpenseTaxContext,
  type ReceiptTotals,
  type ReceiptTotalsRow,
} from "@agent-runway/core/engines/expense-totals-engine";
import { recurringYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import type { RecurringExpense } from "@/lib/types/database";

export interface T2125ExpenseInputs {
  expenseAmounts: Record<string, number>;
  homeOfficeCosts: Record<string, number>;
  /** The receipt totals the amounts were built from (per-key map, uncategorized). */
  receiptTotals: ReceiptTotals;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildT2125ExpenseInputs(input: {
  receiptRows: readonly ReceiptTotalsRow[] | null | undefined;
  expenseItems: readonly { key: string; monthly_recurring: number | string | null }[] | null | undefined;
  /** The rows as entered (NOT already net of ITC). */
  recurringExpenses: readonly RecurringExpense[] | null | undefined;
  ctx: ExpenseTaxContext;
  /** Calendar anchor: the tax year and the day to total up to. */
  today: Date;
}): T2125ExpenseInputs {
  const { ctx, today } = input;
  const receiptTotals = aggregateReceiptTotals(input.receiptRows, ctx);
  const expenseAmounts: Record<string, number> = { ...receiptTotals.byKey };
  const homeOfficeCosts: Record<string, number> = { ...receiptTotals.homeOfficeCosts };
  const add = (map: Record<string, number>, key: string, amount: number) => {
    if (amount > 0) map[key] = round2((map[key] ?? 0) + amount);
  };

  // T2125 is a tax form: expenses incurred, not projected future months.
  // completedMonths = fully elapsed months (March → 2).
  const completedMonths = today.getMonth();
  for (const item of input.expenseItems ?? []) {
    const monthly = Number(item.monthly_recurring ?? 0);
    if (monthly > 0 && completedMonths > 0) add(expenseAmounts, item.key, monthly * completedMonths);
  }

  for (const re of input.recurringExpenses ?? []) {
    if (!re.is_active || !re.category_key) continue;
    const amounts = recurringNetOfItc(re, ctx);
    add(expenseAmounts, re.category_key, recurringYTD({ ...re, amount: amounts.net }, today));
    if (amounts.homeCost) {
      add(homeOfficeCosts, re.category_key, recurringYTD({ ...re, amount: amounts.homeCost }, today));
    }
  }

  return { expenseAmounts, homeOfficeCosts, receiptTotals };
}
