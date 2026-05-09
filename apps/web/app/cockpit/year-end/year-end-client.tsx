"use client";

import { useState } from "react";

interface Props {
  fiscalYear: number;
}

export function YearEndExportButton({ fiscalYear }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cockpit/export-bundle?year=${fiscalYear}`, {
        method: "GET",
      });
      if (!res.ok) {
        let msg = `Export failed (${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) msg = data.error;
        } catch {
          /* keep default */
        }
        setError(msg);
        setDownloading(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `AR-Inc-FY${fiscalYear}-accountant-bundle.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handle}
        disabled={downloading}
        className="border-emerald-500/30 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
      >
        {downloading ? "Building bundle…" : `Generate FY${fiscalYear} accountant bundle (.zip)`}
      </button>
      {error && (
        <p className="text-red-400 bg-red-500/10 border-red-500/30 rounded-md border px-3 py-1.5 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
