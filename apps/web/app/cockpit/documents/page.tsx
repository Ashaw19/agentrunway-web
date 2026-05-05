import { FileWarning } from "lucide-react";
import { PlaceholderPage } from "../_lib/placeholder-page";

export default function DocumentsPage() {
  return (
    <PlaceholderPage
      title="Documents"
      icon={FileWarning}
      blurb="Every corporate-finance finding (Hugo / Vera / Quinn / Tessa / Marcus). Recent anomalies. Accountant-ready exports."
      upcoming={[
        "Latest fresh findings from /memory/findings/ (corporate-finance scoped)",
        "Accountant-ready exports (zip of working papers + receipts)",
        "Magic-link accountant invite (read-only working-papers view)",
        "T2 / T661 / GST34 draft index",
        "Audit trail (every finding ever written, status: fresh | actioned | superseded)",
      ]}
    />
  );
}
