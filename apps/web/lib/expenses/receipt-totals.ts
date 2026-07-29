/**
 * Canonical aggregation for `receipt_expenses` rows.
 *
 * `receipt_expenses.category_key` is NULLABLE and every write path can leave it
 * null — the web capture dialog (`draft.category_key || null`), the mobile save
 * screen (`category || null`), and the mobile scan route (whatever
 * `extraction.suggested_category` came back as, which the extraction prompt
 * explicitly allows to be null).
 *
 * A per-key map is therefore NOT the YTD total. Surfaces that key receipts by
 * expense item (Expenses page rows, Reports' T2125 line allocation) still need
 * the map, but any *total* they display has to add the uncategorized remainder
 * back or it silently comes in under the dashboard — which is the display source
 * of truth and sums every row regardless of category.
 *
 * See `memory/feedback_data_consistency_protocol.md`.
 */

export interface ReceiptTotalsRow {
  category_key?: string | null;
  total_amount?: number | string | null;
}

export interface ReceiptTotals {
  /** Sum per `category_key`. Excludes rows with no category. */
  byKey: Record<string, number>;
  /** Sum of rows with a null/empty `category_key`. */
  uncategorized: number;
  /** Every row, categorized or not. Must equal the dashboard's `receiptYTD`. */
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function aggregateReceiptTotals(
  rows: readonly ReceiptTotalsRow[] | null | undefined,
): ReceiptTotals {
  const byKey: Record<string, number> = {};
  let uncategorized = 0;

  for (const r of rows ?? []) {
    if (r.total_amount == null) continue;
    const amount = Number(r.total_amount);
    if (!Number.isFinite(amount)) continue;
    if (r.category_key) {
      byKey[r.category_key] = round2((byKey[r.category_key] ?? 0) + amount);
    } else {
      uncategorized += amount;
    }
  }

  uncategorized = round2(uncategorized);
  const total = round2(
    Object.values(byKey).reduce((s, v) => s + v, 0) + uncategorized,
  );

  return { byKey, uncategorized, total };
}
