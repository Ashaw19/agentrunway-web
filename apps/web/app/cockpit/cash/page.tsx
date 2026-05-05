import { Wallet } from "lucide-react";
import { PlaceholderPage } from "../_lib/placeholder-page";

export default function CashPage() {
  return (
    <PlaceholderPage
      title="Cash"
      icon={Wallet}
      blurb="Corporate operating cash, by account. Trend over 30 / 90 / 365 days. Inflow vs. outflow split. Runway projection at current burn."
      upcoming={[
        "Operating cash by account (corporate only — never co-mingled with Andrew personally)",
        "30 / 90 / 365-day trend chart",
        "Inflow vs. outflow split (Stripe revenue, grant draws, expense burn)",
        "Burn-rate-driven runway projection",
        "Shareholder-loan balance trend (informational only)",
      ]}
    />
  );
}
