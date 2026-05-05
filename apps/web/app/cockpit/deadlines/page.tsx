import { Calendar } from "lucide-react";
import { PlaceholderPage } from "../_lib/placeholder-page";

export default function DeadlinesPage() {
  return (
    <PlaceholderPage
      title="Deadlines"
      icon={Calendar}
      accent="health"
      blurb="Every corporate filing window, retainer, insurance renewal, and grant milestone in one timeline."
      upcoming={[
        "HST quarterly filings (Quinn-driven, calendar quarters by default)",
        "T2 corporate return (Tessa fires Nov 1 — 60 days before Dec 31 year-end)",
        "Cox & Palmer monthly retainer ($550/mo)",
        "Insurance renewals (E&O / D&O / GL — once bound)",
        "Grant milestones (post-award financial-reporting deliverables)",
        "Calendar export to macOS / iOS",
      ]}
    />
  );
}
