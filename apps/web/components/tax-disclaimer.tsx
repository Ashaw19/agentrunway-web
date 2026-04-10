import { AlertTriangle } from "lucide-react";

export function TaxDisclaimer({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 ${className ?? ""}`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span>
        Agent Runway is not a tax professional. All calculations are for
        informational purposes only. Always consult a qualified tax professional
        before making tax-related decisions.
      </span>
    </div>
  );
}
