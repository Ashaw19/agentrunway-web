import { Receipt } from "lucide-react";
import { PlaceholderPage } from "../_lib/placeholder-page";

export default function HstPage() {
  return (
    <PlaceholderPage
      title="HST"
      icon={Receipt}
      accent="tax"
      blurb="Corporate HST registrant view (separate from Andrew's personal HST). Quarterly draft GST34 values. ITCs running total. Net owing or refundable per quarter."
      upcoming={[
        "Quarterly draft GST34 lines (101 / 105 / 108 / 109) — for accountant review only",
        "ITC running total (HST paid on Vercel / Supabase / Anthropic / etc.)",
        "Quarter-end timeline with filing deadline countdown",
        "Quinn routine output (when QuickBooks authenticates)",
        "Per-vendor HST collected/paid breakdown",
      ]}
    />
  );
}
