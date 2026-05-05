import { Banknote } from "lucide-react";
import { PlaceholderPage } from "../_lib/placeholder-page";

export default function ExpensesPage() {
  return (
    <PlaceholderPage
      title="Expenses"
      icon={Banknote}
      accent="expenses"
      blurb="Every corporate expense, categorized. SR&ED-eligible flag. Personal-card-paid items flagged for shareholder-loan reimbursement."
      upcoming={[
        "QuickBooks-synced expenses by category (CRA T2125 alignment)",
        "SR&ED-eligible / possibly / not-eligible flags (safe-verb framing)",
        "Personal-card-paid corporate expenses awaiting reimbursement",
        "Recurring vs. one-off split",
        "Vendor-level drilldown (Anthropic, Vercel, Supabase, Cox & Palmer, Mem0)",
      ]}
    />
  );
}
