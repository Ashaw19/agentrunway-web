import { Sparkles } from "lucide-react";
import { PlaceholderPage } from "../_lib/placeholder-page";

export default function SredPage() {
  return (
    <PlaceholderPage
      title="SR&ED"
      icon={Sparkles}
      blurb="Year-to-date SR&ED-eligible labor estimate. Marcus daily-log rollup. T661 narrative drafts ready for accountant review."
      upcoming={[
        "Marcus daily-logger rollup (commits per day, eligible-likely vs. possibly)",
        "YTD eligible-labor hours and refundable estimate at 50% rate (NB CCPC)",
        "Major architectural milestone log (T661 scientific-narrative material)",
        "T661 working-paper draft (accountant-ready, never filed)",
        "Year-over-year SR&ED claim trajectory",
      ]}
    />
  );
}
