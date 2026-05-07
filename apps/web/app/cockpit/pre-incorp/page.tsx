import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  CorpTransaction,
  CorpVendor,
  CorpChartOfAccount,
  CorpAccountType,
} from "@agent-runway/core/types/database";
import { RegisterTable, type PreIncorpDisplayRow } from "./register-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// v_corp_pre_incorp_register extends CorpTransaction with three view columns.
type PreIncorpViewRow = CorpTransaction & {
  effective_incurred_date: string;
  days_before_incorp: number;
  cra_rule_status: string | null;
};

export default async function PreIncorpPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cockpit/pre-incorp");

  const [viewResult, vendorsResult, coaResult] = await Promise.all([
    supabase
      .from("v_corp_pre_incorp_register")
      .select("*")
      .eq("user_id", user.id)
      .order("effective_incurred_date", { ascending: false }),
    supabase
      .from("corp_vendors")
      .select("id, name")
      .eq("user_id", user.id),
    supabase
      .from("corp_chart_of_accounts")
      .select("account_code, name, type")
      .order("account_code", { ascending: true }),
  ]);

  const txns = ((viewResult.data ?? []) as unknown) as PreIncorpViewRow[];
  const vendors = (vendorsResult.data ?? []) as Pick<CorpVendor, "id" | "name">[];
  const coa = (coaResult.data ?? []) as Pick<CorpChartOfAccount, "account_code" | "name" | "type">[];

  const vendorById = new Map<string, string>(vendors.map((v) => [v.id, v.name]));
  const accountByCode = new Map<string, { name: string; type: CorpAccountType }>(
    coa.map((a) => [a.account_code, { name: a.name, type: a.type as CorpAccountType }]),
  );

  // Auto-post an inbox item if pre-incorp entries exist and no open one is
  // present. Keeps the accountant-review reminder alive until resolved.
  if (txns.length > 0) {
    const { data: existing } = await supabase
      .from("corp_inbox_items")
      .select("id")
      .eq("user_id", user.id)
      .eq("source", "pre-incorp-ui")
      .is("resolved_at", null)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const n = txns.length;
      await supabase.from("corp_inbox_items").insert({
        user_id:  user.id,
        title:    `${n} pre-incorporation expense${n === 1 ? "" : "s"} need accountant T2 reclassification`,
        body:     `AR Inc. incorporated 2026-04-16. ${n} expense${n === 1 ? "" : "s"} incurred before that date ${n === 1 ? "is" : "are"} flagged for CRA pre-incorp treatment. Review the pre-incorp register with your accountant before filing the T2.`,
        source:   "pre-incorp-ui",
        severity: "medium",
      });
    }
  }

  const rows: PreIncorpDisplayRow[] = txns.map((t) => {
    const acct = t.account_code ? accountByCode.get(t.account_code) : undefined;
    const vendorDisplay =
      (t.vendor_id ? vendorById.get(t.vendor_id) : undefined) ??
      t.vendor_name_raw ??
      null;

    return {
      id:                      t.id,
      effective_incurred_date: t.effective_incurred_date,
      days_before_incorp:      t.days_before_incorp,
      vendor_display:          vendorDisplay,
      account_code:            t.account_code,
      account_name:            acct?.name ?? null,
      amount_pretax:           Number(t.amount_pretax),
      gst_hst:                 Number(t.gst_hst),
      amount_total:            Number(t.amount_total),
      currency:                t.currency,
      description:             t.description,
      needs_review:            t.needs_review,
      review_reason:           t.review_reason,
      cra_rule_status:         t.cra_rule_status,
    };
  });

  return (
    <div className="space-y-6">
      <header className="min-w-0">
        <h1 className="text-foreground font-[var(--font-cockpit-display)] text-4xl font-normal leading-none tracking-tight">
          Pre-incorp register
        </h1>
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
          Expenses incurred before AR Inc. incorporated on 2026-04-16. Each
          entry requires accountant review for CRA pre-incorporation treatment
          on the T2. An inbox item is posted automatically when entries are present.
        </p>
      </header>

      <RegisterTable rows={rows} />
    </div>
  );
}
