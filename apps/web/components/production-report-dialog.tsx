"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateProductionExcel } from "@/lib/reports/production-report-excel";
import { ProductionReportPDF } from "@/lib/reports/production-report-pdf-doc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText, FileSpreadsheet, Download, Loader2 } from "lucide-react";
import { type HistoryItem, type UserSettings } from "@/lib/types/database";
import { createElement } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  historyItems: HistoryItem[];
  settings: UserSettings;
}

export function ProductionReportDialog({ open, onClose, historyItems, settings }: Props) {
  const [format, setFormat] = useState<"pdf" | "excel">("pdf");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const years = historyItems.map(h => h.year).sort((a, b) => b - a);

  const agentName = settings.display_name ?? "";
  const brokerage = settings.brokerage_name ?? "";

  async function handleGenerate() {
    setLoading(true);
    try {
      // Fetch client records for deal-level detail
      const supabase = createClient();
      let query = supabase
        .from("client_records")
        .select("*")
        .eq("user_id", settings.user_id)
        .order("close_date", { ascending: true });

      if (yearFilter !== "all") {
        query = query.eq("year", parseInt(yearFilter));
      }

      const { data: clientRecords } = await query;
      const records = clientRecords ?? [];

      const reportData = {
        historyItems,
        clientRecords: records,
        agentName,
        brokerage,
        province: settings.province ?? "",
        generatedAt: new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }),
        yearFilter: yearFilter !== "all" ? parseInt(yearFilter) : undefined,
      };

      if (format === "excel") {
        await generateProductionExcel(reportData, yearFilter !== "all" ? parseInt(yearFilter) : undefined);
      } else {
        const { pdf } = await import("@react-pdf/renderer");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blob = await pdf(createElement(ProductionReportPDF, reportData) as any).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = yearFilter !== "all"
          ? `production-report-${yearFilter}.pdf`
          : "career-production-report.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      onClose();
    } catch (e) {
      console.error("[ProductionReportDialog] generation error:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Generate Production Report</DialogTitle>
          <DialogDescription>
            Export your historical deal data as a branded PDF or Excel file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format selection */}
          <div className="grid gap-2">
            <Label>Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["pdf", "excel"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
                    format === f
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {f === "pdf" ? <FileText className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
                  {f === "pdf" ? "PDF" : "Excel"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {format === "pdf"
                ? "Branded PDF with cover page, career summary, and per-year deal logs."
                : "Excel with Career Summary sheet + one tab per year."}
            </p>
          </div>

          {/* Year selection */}
          <div className="grid gap-2">
            <Label>Years to include</Label>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Full Career ({years.length} year{years.length !== 1 ? "s" : ""})</SelectItem>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)}>{y} only</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={handleGenerate}
            disabled={loading || historyItems.length === 0}
            className="flex-1"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Download className="h-4 w-4 mr-2" />}
            {loading ? "Generating…" : "Download"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
