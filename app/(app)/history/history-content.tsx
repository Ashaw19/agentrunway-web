"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Lock,
  Unlock,
  Plus,
  ChevronDown,
  ChevronRight,
  Info,
  Trash2,
  Upload,
  Loader2,
  FileText,
  CheckCircle2,
  UserCheck,
  AlertCircle,
} from "lucide-react";
import { fmtCurrency } from "@/lib/formatters";
import { computeGCI, type HistoryItem, type Transaction } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import type { ImportResult } from "@/app/api/import-history/route";

interface Props {
  historyItems: HistoryItem[];
  transactions: Transaction[];
}

// Per-quarter colour config
const QUARTER_STYLES = [
  { label: "Q1", border: "border-blue-200",   bg: "bg-blue-50",   heading: "text-blue-700",   ring: "focus-visible:ring-blue-400"   },
  { label: "Q2", border: "border-amber-200",  bg: "bg-amber-50",  heading: "text-amber-700",  ring: "focus-visible:ring-amber-400"  },
  { label: "Q3", border: "border-emerald-200",bg: "bg-emerald-50",heading: "text-emerald-700",ring: "focus-visible:ring-emerald-400" },
  { label: "Q4", border: "border-violet-200", bg: "bg-violet-50", heading: "text-violet-700", ring: "focus-visible:ring-violet-400"  },
];

type ImportStatus = "idle" | "rendering" | "extracting" | "preview" | "saving";

const SPLIT_OPTIONS: { label: string; value: number }[] = [
  { label: "70/30 — agent keeps 70%", value: 0.70 },
  { label: "75/25 — agent keeps 75%", value: 0.75 },
  { label: "80/20 — agent keeps 80%", value: 0.80 },
  { label: "85/15 — agent keeps 85%", value: 0.85 },
  { label: "90/10 — agent keeps 90%", value: 0.90 },
  { label: "95/5  — agent keeps 95%", value: 0.95 },
  { label: "100%  — no brokerage split", value: 1.00 },
];

export function HistoryContent({ historyItems: initial, transactions }: Props) {
  const [items, setItems] = useState(initial);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addYear, setAddYear] = useState(new Date().getFullYear() - 1);
  const [addGCI, setAddGCI] = useState("");
  const [addTx, setAddTx] = useState("");
  // Track which item+field is currently saving (for subtle feedback)
  const [saving, setSaving] = useState<string | null>(null);
  // Two-step delete confirmation: holds the id of the year pending confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── PDF / single-year import state ───────────────────────────────────────
  const [importOpen, setImportOpen]       = useState(false);
  const [importStatus, setImportStatus]   = useState<ImportStatus>("idle");
  const [importData, setImportData]       = useState<ImportResult | null>(null);
  // Per-deal: which party is the agent's client (0 = party_a, 1 = party_b)
  const [agentSides, setAgentSides]       = useState<Record<number, 0 | 1>>({});

  // ── Batch (multi-year) import state ──────────────────────────────────────
  const [batchImportData, setBatchImportData]   = useState<ImportResult[]>([]);
  const [batchProgress, setBatchProgress]       = useState({ current: 0, total: 0 });

  // ── Split selection state ─────────────────────────────────────────────────
  // Per-dialog split selectors; batchSplitPcts is initialised from auto-detection
  const [addSplitPct,    setAddSplitPct]    = useState<number>(0.75);
  const [importSplitPct, setImportSplitPct] = useState<number>(0.75);
  const [batchSplitPcts, setBatchSplitPcts] = useState<Record<number, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group transactions by year for auto-derived stats
  const txByYear = transactions.reduce<Record<number, Transaction[]>>(
    (acc, tx) => {
      const y = new Date(tx.date).getFullYear();
      (acc[y] ??= []).push(tx);
      return acc;
    },
    {},
  );

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function toggleLock(item: HistoryItem) {
    const supabase = createClient();
    const { error } = await supabase
      .from("history_items")
      .update({ is_locked: !item.is_locked })
      .eq("id", item.id);
    if (!error) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, is_locked: !i.is_locked } : i,
        ),
      );
      toast(item.is_locked ? "Year unlocked ✓" : "Year locked 🔒");
    }
  }

  // ── Inline edit helpers ──────────────────────────────────────────────────

  async function updateAnnualGCI(item: HistoryItem, value: string) {
    const num = parseFloat(value) || 0;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, annual_gci: num } : i));
    setSaving(`${item.id}-annual_gci`);
    const supabase = createClient();
    await supabase.from("history_items").update({ annual_gci: num }).eq("id", item.id);
    setSaving(null);
  }

  async function updateAnnualTx(item: HistoryItem, value: string) {
    const num = parseInt(value) || 0;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, annual_tx: num } : i));
    setSaving(`${item.id}-annual_tx`);
    const supabase = createClient();
    await supabase.from("history_items").update({ annual_tx: num }).eq("id", item.id);
    setSaving(null);
  }

  async function updateQuarterGCI(item: HistoryItem, qi: number, value: string) {
    const num = parseFloat(value) || 0;
    const newArr = [...(item.quarter_gci as number[])];
    newArr[qi] = num;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, quarter_gci: newArr } : i));
    setSaving(`${item.id}-qgci-${qi}`);
    const supabase = createClient();
    await supabase.from("history_items").update({ quarter_gci: newArr }).eq("id", item.id);
    setSaving(null);
  }

  async function updateQuarterTx(item: HistoryItem, qi: number, value: string) {
    const num = parseInt(value) || 0;
    const newArr = [...(item.quarter_tx as number[])];
    newArr[qi] = num;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, quarter_tx: newArr } : i));
    setSaving(`${item.id}-qtx-${qi}`);
    const supabase = createClient();
    await supabase.from("history_items").update({ quarter_tx: newArr }).eq("id", item.id);
    setSaving(null);
  }

  async function handleAddYear() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("history_items")
      .insert({
        user_id: user.id,
        year: addYear,
        annual_gci: parseFloat(addGCI) || 0,
        annual_tx: parseInt(addTx) || 0,
        quarter_gci: [0, 0, 0, 0],
        quarter_tx: [0, 0, 0, 0],
        split_pct: addSplitPct,
      })
      .select()
      .single();

    if (!error && data) {
      setItems((prev) => [data, ...prev].sort((a, b) => b.year - a.year));
      setAddOpen(false);
      setAddGCI("");
      setAddTx("");
      setExpanded((prev) => new Set([...prev, data.id]));
      toast.success(`${addYear} history added ✓`);
    } else if (error) {
      toast.error("Couldn't add year — please try again.");
    }
  }

  async function handleDeleteYear(item: HistoryItem) {
    const supabase = createClient();
    const { error } = await supabase
      .from("history_items")
      .delete()
      .eq("id", item.id);
    if (!error) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setConfirmDeleteId(null);
      toast.success(`${item.year} removed from history.`);
    } else {
      toast.error("Couldn't delete year — please try again.");
    }
  }

  // ── PDF import handlers ──────────────────────────────────────────────────

  function detectFileType(file: File): "pdf" | "image" | "excel" | "csv" | null {
    const name = file.name.toLowerCase();
    if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    if (file.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/.test(name)) return "image";
    if (/\.(xlsx?|xls)$/.test(name) || file.type.includes("spreadsheet")) return "excel";
    if (name.endsWith(".csv") || file.type === "text/csv") return "csv";
    return null;
  }

  async function handleImportFile(file: File) {
    const fileType = detectFileType(file);
    if (!fileType) {
      toast.error("Unsupported file type. Please upload a PDF, image (JPG/PNG), Excel, or CSV file.");
      return;
    }

    setImportOpen(true);
    setImportStatus("rendering");
    setImportData(null);
    setAgentSides({});

    try {
      let imageBase64: string | undefined;
      let mimeType: string | undefined;
      let textContent: string | undefined;

      if (fileType === "pdf") {
        // ── PDF: render page 2 (transaction report), skip page 1 (T4A) ──────
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const pageNum = pdf.numPages >= 2 ? 2 : 1;
        const page = await pdf.getPage(pageNum);

        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // pdfjs-dist v5: pass canvas directly
        await page.render({ canvas, viewport }).promise;

        imageBase64 = canvas.toDataURL("image/jpeg", 0.90).split(",")[1];
        mimeType = "image/jpeg";

      } else if (fileType === "image") {
        // ── Image: read as base64 and send directly to Groq vision ──────────
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        imageBase64 = btoa(binary);
        mimeType = file.type || "image/jpeg";

      } else if (fileType === "excel") {
        // ── Excel: parse with SheetJS ────────────────────────────────────────
        const XLSX = await import("xlsx");
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });

        // Detect multi-year career tracker (sheets named with 4-digit years)
        const yearSheets = workbook.SheetNames.filter((n) => /\b20\d{2}\b/.test(n));

        if (yearSheets.length > 1) {
          // ── Batch mode: process each year-sheet separately ─────────────────
          setBatchImportData([]);
          setBatchProgress({ current: 0, total: yearSheets.length });
          setImportStatus("extracting");

          const results: ImportResult[] = [];
          const detectedSplitMap: Record<number, number> = {};
          for (let si = 0; si < yearSheets.length; si++) {
            setBatchProgress({ current: si + 1, total: yearSheets.length });
            const sheetName = yearSheets[si];
            // Extract year from the SHEET NAME (reliable) — not the title row
            const sheetYear = parseInt(/\b(20\d{2})\b/.exec(sheetName)?.[1] ?? "0");
            const ws = workbook.Sheets[sheetName];

            // Try browser-side parsing first — 100% reliable for agent tracker format
            // (handles $-prefixed GCI, 2-digit years, Q1-Q4, missing-year dates)
            const rawRows = XLSX.utils.sheet_to_json<string[]>(ws, {
              header: 1, defval: "", raw: false,
            }) as string[][];
            const { deals: trackerDeals, detectedSplit } = parseTrackerSheet(rawRows, sheetYear);

            if (trackerDeals.length > 0) {
              // No Groq needed — computed fully in-browser; pass detected split
              const result = computeLocalAggregates(trackerDeals, sheetYear, detectedSplit ?? undefined);
              if (result.annual_tx > 0) {
                results.push(result);
                if (detectedSplit) detectedSplitMap[sheetYear] = detectedSplit;
              }
            } else {
              // Fallback: send to Groq with year hint from sheet name
              const csv = XLSX.utils.sheet_to_csv(ws);
              const res = await fetch("/api/import-history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ textContent: csv, yearHint: sheetYear }),
              });
              if (res.ok) {
                const yr = await res.json() as ImportResult;
                if (yr.annual_tx > 0) results.push(yr);
              }
            }
          }

          const sortedResults = results.sort((a, b) => b.year - a.year);
          setBatchImportData(sortedResults);
          // Pre-populate split selectors from auto-detected GCI/Net ratios
          setBatchSplitPcts(sortedResults.reduce((acc, r) => {
            acc[r.year] = detectedSplitMap[r.year] ?? r.split_pct ?? 0.75;
            return acc;
          }, {} as Record<number, number>));
          setImportStatus("preview");
          return; // skip single-year flow
        }

        // Single-sheet Excel — existing flow
        const targetSheet =
          workbook.SheetNames.find((n) =>
            /commission|transaction|deal|sale/i.test(n),
          ) ?? workbook.SheetNames[0];
        textContent = XLSX.utils.sheet_to_csv(workbook.Sheets[targetSheet]);

      } else if (fileType === "csv") {
        // ── CSV: read as plain text ──────────────────────────────────────────
        textContent = await file.text();
      }

      setImportStatus("extracting");

      const res = await fetch("/api/import-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType, textContent }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Extraction failed");
      }

      const data = await res.json() as ImportResult;

      // Pre-populate agent_side selections from Groq's best guess
      const sides: Record<number, 0 | 1> = {};
      data.deals.forEach((deal, i) => {
        if (deal.agent_side === 0 || deal.agent_side === 1) {
          sides[i] = deal.agent_side;
        }
      });

      setImportData(data);
      setImportSplitPct(data.split_pct ?? 0.75);
      setAgentSides(sides);
      setImportStatus("preview");
    } catch (err) {
      console.error("[import] error:", err);
      toast.error("Couldn't read the file — please try again.");
      setImportStatus("idle");
      setImportOpen(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSaveImport() {
    if (!importData) return;
    setImportStatus("saving");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      user_id: user.id,
      year: importData.year,
      annual_gci: importData.annual_gci,
      annual_tx: importData.annual_tx,
      quarter_gci: importData.quarter_gci,
      quarter_tx: importData.quarter_tx,
      split_pct: importSplitPct,
    };

    // Check if a row for this year already exists — UNIQUE (user_id, year)
    const { data: existing } = await supabase
      .from("history_items")
      .select("id")
      .eq("user_id", user.id)
      .eq("year", importData.year)
      .maybeSingle();

    let data, error;
    if (existing?.id) {
      // Update the existing row
      ({ data, error } = await supabase
        .from("history_items")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single());
    } else {
      // Insert a new row
      ({ data, error } = await supabase
        .from("history_items")
        .insert(payload)
        .select()
        .single());
    }

    if (!error && data) {
      // ── Save client records for this year ─────────────────────────────────
      // Delete existing client_records for this year then re-insert
      await supabase.from("client_records").delete()
        .eq("user_id", user.id).eq("year", importData.year);

      const clientInserts = importData.deals
        .map((deal, i) => {
          const sideSelected = agentSides[i] ?? deal.agent_side;
          const clientName = sideSelected === 1 ? deal.party_b : deal.party_a;
          if (!clientName) return null;
          return {
            user_id: user.id,
            name: clientName,
            side: deal.side ?? null,
            source: deal.source ?? null,
            address: deal.address || null,
            close_date: deal.date || null,
            year: importData.year,
            gci: deal.gci,
          };
        })
        .filter(Boolean);

      if (clientInserts.length > 0) {
        await supabase.from("client_records").insert(clientInserts);
      }

      setItems((prev) => {
        const without = prev.filter((i) => i.id !== (existing?.id ?? "___"));
        return [data, ...without].sort((a, b) => b.year - a.year);
      });
      setExpanded((prev) => new Set([...prev, data.id]));
      setImportOpen(false);
      setImportStatus("idle");
      setImportData(null);
      toast.success(
        existing?.id
          ? `${importData.year} history replaced · ${clientInserts.length} clients saved ✓`
          : `${importData.year} imported · ${clientInserts.length} clients saved ✓`,
      );
    } else {
      console.error("[save import]", error);
      toast.error(error?.message ?? "Couldn't save — please try again.");
      setImportStatus("preview");
    }
  }

  function handleImportClose() {
    if (importStatus === "saving") return; // don't close mid-save
    setImportOpen(false);
    setImportStatus("idle");
    setImportData(null);
    setAgentSides({});
    setBatchImportData([]);
    setBatchProgress({ current: 0, total: 0 });
    setBatchSplitPcts({});
  }

  // ── Batch save: save all years from a multi-sheet Excel ──────────────────
  async function handleBatchSave() {
    if (batchImportData.length === 0) return;
    setImportStatus("saving");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let savedYears = 0;
    let totalClients = 0;

    for (const yearData of batchImportData) {
      const effectiveSplit = batchSplitPcts[yearData.year] ?? yearData.split_pct ?? 0.75;
      const payload = {
        user_id: user.id,
        year: yearData.year,
        annual_gci: yearData.annual_gci,
        annual_tx: yearData.annual_tx,
        quarter_gci: yearData.quarter_gci,
        quarter_tx: yearData.quarter_tx,
        split_pct: effectiveSplit,
      };

      const { data: existing } = await supabase
        .from("history_items").select("id")
        .eq("user_id", user.id).eq("year", yearData.year).maybeSingle();

      let saved;
      if (existing?.id) {
        ({ data: saved } = await supabase
          .from("history_items").update(payload).eq("id", existing.id).select().single());
      } else {
        ({ data: saved } = await supabase
          .from("history_items").insert(payload).select().single());
      }
      if (saved) {
        setItems((prev) => {
          const without = prev.filter((i) => i.id !== (existing?.id ?? "___"));
          return [saved, ...without].sort((a, b) => b.year - a.year);
        });
        savedYears++;
      }

      // Save client records for this year
      await supabase.from("client_records").delete()
        .eq("user_id", user.id).eq("year", yearData.year);

      const clientInserts = yearData.deals
        .filter((d) => d.party_a)
        .map((d) => ({
          user_id: user.id,
          name: d.party_a,           // in career tracker, party_a is always the client
          side: d.side ?? null,
          source: d.source ?? null,
          address: d.address || null,
          close_date: d.date || null,
          year: yearData.year,
          gci: d.gci,
        }));

      if (clientInserts.length > 0) {
        await supabase.from("client_records").insert(clientInserts);
        totalClients += clientInserts.length;
      }
    }

    setImportOpen(false);
    setImportStatus("idle");
    setBatchImportData([]);
    toast.success(
      `${savedYears} years imported · ${totalClients} clients saved to your database ✓`,
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">
            Your track record — where you&apos;ve been shapes where you&apos;re going.
          </p>
        </div>

        {/* ── Action buttons ─────────────────────────────────────── */}
        <div className="flex items-center gap-2">

          {/* Import from brokerage report */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1 h-4 w-4" />
            Import from Report
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls,.csv,application/pdf,image/*,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
            }}
          />

          {/* Manual Add Year dialog */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Add Year
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add History Year</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                  Enter your annual totals here. After saving, expand the year card to fill in quarterly breakdowns — quarterly data powers the seasonality engine.
                </p>
                <div className="grid gap-2">
                  <Label>Year</Label>
                  <Input
                    type="number"
                    value={addYear}
                    onChange={(e) => setAddYear(parseInt(e.target.value))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Annual GCI ($)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={addGCI}
                    onChange={(e) => setAddGCI(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Total Transactions</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={addTx}
                    onChange={(e) => setAddTx(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Brokerage Split</Label>
                  <select
                    value={addSplitPct}
                    onChange={(e) => setAddSplitPct(Number(e.target.value))}
                    className="border border-input rounded-md h-10 px-3 text-sm bg-background w-full outline-none cursor-pointer"
                  >
                    {SPLIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <Button onClick={handleAddYear}>Save &amp; Add Quarterly Data</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Import dialog ─────────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={handleImportClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Import from Brokerage Report
            </DialogTitle>
          </DialogHeader>

          {/* Loading states */}
          {(importStatus === "rendering" || importStatus === "extracting") && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">
                  {importStatus === "rendering"
                    ? "Preparing your file…"
                    : batchProgress.total > 1
                    ? `Processing year ${batchProgress.current} of ${batchProgress.total}…`
                    : "Extracting data with AI…"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {importStatus === "rendering"
                    ? "Reading your brokerage report"
                    : batchProgress.total > 1
                    ? "Analysing each year sheet with Groq — please wait"
                    : "Groq is reading your transaction table — usually 5–10 seconds"}
                </p>
              </div>
            </div>
          )}

          {/* ── Batch import preview (multi-year Excel career tracker) ── */}
          {(importStatus === "preview" || importStatus === "saving") && batchImportData.length > 0 && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    {batchImportData.length} years found in your career tracker
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Review each year below, then click Import to save all at once.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {batchImportData.map((yr) => {
                  const hasExisting = items.some((i) => i.year === yr.year);
                  const totalClients = yr.deals.filter((d) => d.party_a).length;
                  return (
                    <div
                      key={yr.year}
                      className="rounded-xl border border-border/60 bg-card px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{yr.year}</span>
                            {hasExisting && (
                              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                replaces existing
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fmtCurrency(yr.annual_gci)} GCI · {yr.annual_tx} deal{yr.annual_tx !== 1 ? "s" : ""} · {totalClients} client{totalClients !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="grid grid-cols-4 gap-1 shrink-0">
                          {yr.quarter_gci.map((q, qi) => (
                            <div key={qi} className={cn("rounded px-1.5 py-1 text-center text-[10px]", QUARTER_STYLES[qi].bg, QUARTER_STYLES[qi].border, "border")}>
                              <span className={cn("font-bold block", QUARTER_STYLES[qi].heading)}>Q{qi + 1}</span>
                              <span className="text-slate-600">{q > 0 ? `$${Math.round(q / 1000)}k` : "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Per-year brokerage split selector */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">Brokerage split:</span>
                        <select
                          value={batchSplitPcts[yr.year] ?? 0.75}
                          onChange={(e) => setBatchSplitPcts((prev) => ({ ...prev, [yr.year]: Number(e.target.value) }))}
                          className="text-[11px] border border-border rounded px-2 py-0.5 bg-card outline-none cursor-pointer"
                        >
                          {SPLIT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        {yr.split_pct && (
                          <span className="text-[10px] text-emerald-600 font-medium">✓ auto-detected</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3 shrink-0" />
                {batchImportData.reduce((s, yr) => s + yr.deals.filter((d) => d.party_a).length, 0)} client records will be saved to your database.
              </p>

              <div className="flex items-center justify-between border-t border-border/40 pt-3">
                <Button variant="ghost" size="sm" onClick={handleImportClose} disabled={importStatus === "saving"}>
                  Cancel
                </Button>
                <Button onClick={handleBatchSave} disabled={importStatus === "saving"}>
                  {importStatus === "saving" ? (
                    <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</>
                  ) : (
                    `Import All ${batchImportData.length} Years`
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Preview / confirm */}
          {(importStatus === "preview" || importStatus === "saving") && importData && batchImportData.length === 0 && (
            <div className="space-y-5 py-2">

              {/* Duplicate year warning */}
              {items.some((i) => i.year === importData.year) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    You already have a <strong>{importData.year}</strong> history year.
                    Saving will replace it with the data below.
                  </p>
                </div>
              )}

              {/* Summary banner */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    {importData.year} — {fmtCurrency(importData.annual_gci)} GCI · {importData.annual_tx} deals
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Extracted from your brokerage report. Review the details below before saving.
                  </p>
                </div>
              </div>

              {/* Brokerage split selector */}
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-foreground">Brokerage Split</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Your share of each commission this year</p>
                </div>
                <select
                  value={importSplitPct}
                  onChange={(e) => setImportSplitPct(Number(e.target.value))}
                  className="text-sm border border-input rounded-md px-2.5 py-1.5 bg-background outline-none cursor-pointer shrink-0"
                >
                  {SPLIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Quarterly breakdown */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  Quarterly Breakdown
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {QUARTER_STYLES.map((qs, qi) => (
                    <div
                      key={qs.label}
                      className={cn("rounded-xl border p-3 text-center", qs.border, qs.bg)}
                    >
                      <p className={cn("text-[11px] font-bold uppercase tracking-wide mb-1", qs.heading)}>
                        {qs.label}
                      </p>
                      <p className="text-sm font-bold text-slate-800 tabular-nums">
                        {fmtCurrency(importData.quarter_gci[qi] ?? 0)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {importData.quarter_tx[qi] ?? 0} deal{(importData.quarter_tx[qi] ?? 0) !== 1 ? "s" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Deal-by-deal review */}
              <div>
                {/* Only show party-selection header when party_b data is present */}
                {importData.deals.some((d) => d.party_b) ? (
                  <div className="flex items-center gap-1.5 mb-2">
                    <UserCheck className="h-3.5 w-3.5 text-slate-500" />
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Deals — tap to select which party was your client
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mb-2">
                    <UserCheck className="h-3.5 w-3.5 text-slate-500" />
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Deals
                    </p>
                  </div>
                )}

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {importData.deals.map((deal, i) => {
                    const selected = agentSides[i];
                    const hasTwoParties = Boolean(deal.party_b);
                    const date = new Date(deal.date + "T12:00:00").toLocaleDateString("en-CA", {
                      month: "short",
                      day: "numeric",
                    });

                    const sideBadge =
                      deal.side === "buyer"  ? { label: "Buyer",  cls: "bg-teal-50 text-teal-700 border-teal-200" }
                      : deal.side === "seller" ? { label: "Seller", cls: "bg-amber-50 text-amber-700 border-amber-200" }
                      : deal.side === "both"   ? { label: "Both",   cls: "bg-violet-50 text-violet-700 border-violet-200" }
                      : null;

                    return (
                      <div
                        key={i}
                        className="rounded-xl border border-border/60 bg-card px-3 py-2.5 space-y-2"
                      >
                        {/* Deal header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {deal.address}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <p className="text-[11px] text-muted-foreground">
                                {date} · {fmtCurrency(deal.gci)} GCI
                              </p>
                              {sideBadge && (
                                <span className={cn("text-[10px] font-semibold border rounded px-1.5 py-0.5", sideBadge.cls)}>
                                  {sideBadge.label}
                                </span>
                              )}
                              {deal.source && (
                                <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                                  {deal.source}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] font-medium text-slate-400 shrink-0 tabular-nums">
                            #{String(i + 1).padStart(2, "0")}
                          </span>
                        </div>

                        {/* Party display — toggle if two parties, read-only if only one */}
                        {hasTwoParties ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setAgentSides((prev) => ({ ...prev, [i]: 0 }))}
                              className={cn(
                                "rounded-lg border px-2 py-1.5 text-left text-[11px] leading-snug transition-all",
                                selected === 0
                                  ? "border-primary bg-primary/10 text-primary font-semibold"
                                  : "border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/5",
                              )}
                            >
                              <span className="block text-[10px] font-bold uppercase tracking-wide mb-0.5 opacity-60">
                                {selected === 0 ? "✓ My Client" : "Party A"}
                              </span>
                              {deal.party_a}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAgentSides((prev) => ({ ...prev, [i]: 1 }))}
                              className={cn(
                                "rounded-lg border px-2 py-1.5 text-left text-[11px] leading-snug transition-all",
                                selected === 1
                                  ? "border-primary bg-primary/10 text-primary font-semibold"
                                  : "border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/5",
                              )}
                            >
                              <span className="block text-[10px] font-bold uppercase tracking-wide mb-0.5 opacity-60">
                                {selected === 1 ? "✓ My Client" : "Party B"}
                              </span>
                              {deal.party_b}
                            </button>
                          </div>
                        ) : (
                          // Single-party tracker: show client name as a read-only pill
                          <div className="rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5">
                            <span className="block text-[10px] font-bold uppercase tracking-wide mb-0.5 text-primary/60">
                              ✓ My Client
                            </span>
                            <span className="text-[11px] font-semibold text-primary">{deal.party_a}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {importData.deals.some((d) => d.party_b) && (
                  <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    Party selection is for your records. Your GCI values come from the
                    &ldquo;Taxable&rdquo; column and are correct regardless of which side you represented.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between border-t border-border/40 pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleImportClose}
                  disabled={importStatus === "saving"}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveImport}
                  disabled={importStatus === "saving"}
                >
                  {importStatus === "saving" ? (
                    <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</>
                  ) : items.some((i) => i.year === importData.year) ? (
                    `Replace ${importData.year} Data`
                  ) : (
                    `Save ${importData.year} to History`
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── History year cards ────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            No history years yet. Add your first year to improve projections.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const isOpen = expanded.has(item.id);
            const yearTx = txByYear[item.year] ?? [];
            const derivedGCI = yearTx.reduce((sum, tx) => sum + computeGCI(tx), 0);

            const quarterGCI = item.quarter_gci as number[];
            const quarterTx = item.quarter_tx as number[];
            const quarterGCISum = quarterGCI.reduce((s, v) => s + (v ?? 0), 0);
            const quarterTxSum = quarterTx.reduce((s, v) => s + (v ?? 0), 0);
            const hasQuarterData = quarterGCISum > 0 || quarterTxSum > 0;

            const accentBorders = [
              "border-l-blue-500",
              "border-l-violet-500",
              "border-l-emerald-500",
              "border-l-amber-500",
              "border-l-teal-500",
              "border-l-rose-500",
            ];
            const accentBorder = accentBorders[idx % accentBorders.length];

            return (
              <Card key={item.id} className={`rounded-2xl border-l-4 shadow-sm transition-shadow hover:shadow-md ${accentBorder}`}>
                <CardHeader
                  className="cursor-pointer select-none"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <CardTitle className="text-lg font-bold">{item.year}</CardTitle>
                      {item.is_locked && (
                        <Badge variant="outline" className="text-xs">Locked</Badge>
                      )}
                      {!hasQuarterData && !item.is_locked && (
                        <Badge className="bg-amber-100 text-amber-700 text-xs border border-amber-200 hover:bg-amber-100">
                          No quarterly data
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-base font-bold text-slate-800">
                        {fmtCurrency(item.annual_gci)}
                      </span>
                      <span className="text-muted-foreground">
                        {item.annual_tx} deals
                      </span>
                    </div>
                  </div>
                </CardHeader>

                {isOpen && (
                  <CardContent className="space-y-5 pt-0" onClick={(e) => e.stopPropagation()}>

                    {/* ── Annual totals (editable) ─────────────────────────── */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Annual Totals
                      </p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Annual GCI ($)</Label>
                          <Input
                            type="number"
                            disabled={item.is_locked}
                            defaultValue={item.annual_gci || ""}
                            placeholder="0"
                            className={cn("h-9 text-sm font-semibold", saving === `${item.id}-annual_gci` && "opacity-60")}
                            onBlur={(e) => updateAnnualGCI(item, e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs text-muted-foreground">Annual Transactions</Label>
                          <Input
                            type="number"
                            disabled={item.is_locked}
                            defaultValue={item.annual_tx || ""}
                            placeholder="0"
                            className={cn("h-9 text-sm font-semibold", saving === `${item.id}-annual_tx` && "opacity-60")}
                            onBlur={(e) => updateAnnualTx(item, e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── Quarterly breakdown (editable) ───────────────────── */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Quarterly Breakdown
                        </p>
                        {quarterGCISum > 0 && Math.abs(quarterGCISum - item.annual_gci) > 100 && (
                          <span className="text-[11px] text-amber-600">
                            ∑Q = {fmtCurrency(quarterGCISum)} (differs from annual)
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {QUARTER_STYLES.map((qs, qi) => (
                          <div
                            key={qs.label}
                            className={cn(
                              "rounded-xl border p-3 space-y-2",
                              qs.border,
                              qs.bg,
                            )}
                          >
                            <p className={cn("text-xs font-bold uppercase tracking-wide", qs.heading)}>
                              {qs.label}
                            </p>
                            <div className="space-y-1.5">
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">GCI ($)</p>
                                <Input
                                  type="number"
                                  disabled={item.is_locked}
                                  defaultValue={(quarterGCI[qi] ?? 0) || ""}
                                  placeholder="0"
                                  className={cn(
                                    "h-8 text-sm bg-white/80",
                                    saving === `${item.id}-qgci-${qi}` && "opacity-60",
                                  )}
                                  onBlur={(e) => updateQuarterGCI(item, qi, e.target.value)}
                                />
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground mb-0.5">Deals</p>
                                <Input
                                  type="number"
                                  disabled={item.is_locked}
                                  defaultValue={(quarterTx[qi] ?? 0) || ""}
                                  placeholder="0"
                                  className={cn(
                                    "h-8 text-sm bg-white/80",
                                    saving === `${item.id}-qtx-${qi}` && "opacity-60",
                                  )}
                                  onBlur={(e) => updateQuarterTx(item, qi, e.target.value)}
                                />
                              </div>
                            </div>
                            {(quarterGCI[qi] ?? 0) > 0 && (
                              <p className={cn("text-[10px] font-medium", qs.heading)}>
                                {fmtCurrency(quarterGCI[qi])}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Values auto-save on blur. Quarterly data is used to calibrate the seasonality engine for projections.
                      </p>
                    </div>

                    {/* ── Derived from live transactions ────────────────────── */}
                    {yearTx.length > 0 && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                        <p className="text-xs text-blue-700">
                          <span className="font-semibold">Live data:</span>{" "}
                          {yearTx.length} transactions in your log → {fmtCurrency(derivedGCI)} GCI
                        </p>
                      </div>
                    )}

                    {/* ── Lock / Unlock + Delete ────────────────────────────── */}
                    <div className="flex items-center justify-between border-t border-border/40 pt-3">
                      <p className="text-xs text-muted-foreground">
                        {item.is_locked ? "Locked — data frozen for use in projections." : "Unlocked — you can edit all values."}
                      </p>
                      <div className="flex items-center gap-1">
                        {confirmDeleteId === item.id ? (
                          <>
                            <span className="text-xs text-red-600 font-medium mr-1">Delete {item.year}?</span>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteYear(item)}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-red-600 hover:bg-red-50"
                            disabled={item.is_locked}
                            title={item.is_locked ? "Unlock this year before deleting" : `Delete ${item.year}`}
                            onClick={() => setConfirmDeleteId(item.id)}
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Delete
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleLock(item)}
                        >
                          {item.is_locked ? (
                            <><Unlock className="mr-1 h-3 w-3" /> Unlock</>
                          ) : (
                            <><Lock className="mr-1 h-3 w-3" /> Lock</>
                          )}
                        </Button>
                      </div>
                    </div>

                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Browser-side Agent Tracker CSV Parser
// Parses the agent's own career tracker spreadsheet WITHOUT Groq.
// Handles: $-prefixed numbers, 2-digit years, Q1-Q4 labels, missing-year dates.
// Falls back to the Groq API for any sheet that doesn't match this format.
// ═══════════════════════════════════════════════════════════════════════════════

type TrackerHeaders = {
  nameCol: number;
  addrCol: number;
  dateCol: number;
  sideCol: number;
  sourceCol: number;
  gciCol: number;   // GCI column (pre-split) — primary dollar value
  netCol: number;   // Net Commission (post-split) — used to detect brokerage split ratio
  rowIdx: number;
};

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[\s|$,#]/g, "");
}

/** Find the header row and column indices for the agent tracker format. */
function findTrackerHeaders(rows: string[][]): TrackerHeaders | null {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const hdrs = rows[i].map(normaliseHeader);
    const nameCol = hdrs.findIndex((h) => h === "name");
    const sideCol = hdrs.findIndex((h) => h.startsWith("buy") || h.startsWith("rent"));
    // Primary: dedicated GCI column (pre-split); fallback: Net Commission (post-split)
    const gciCol  = hdrs.findIndex((h) => h === "gci" || h === "grosscommission" || h === "grosscommissionincome");
    const netCol  = hdrs.findIndex((h) => h.includes("netcommission") || h.includes("netincome") || h === "net");
    // Require: name + side + at least one money column
    if (nameCol !== -1 && sideCol !== -1 && (gciCol !== -1 || netCol !== -1)) {
      return {
        nameCol,
        addrCol:   hdrs.findIndex((h) => h === "address"),
        dateCol:   hdrs.findIndex((h) => h.includes("date") || h.includes("close")),
        sideCol,
        sourceCol: hdrs.findIndex((h) => h === "source"),
        gciCol,
        netCol,
        rowIdx: i,
      };
    }
  }
  return null;
}

/** Parse a messy date cell from the agent tracker into YYYY-MM-DD. */
function parseTrackerDate(raw: string, year: number): string {
  const s = raw?.trim() ?? "";
  if (!s) return `${year}-06-15`;

  // Q1 / Q2 / Q3 / Q4
  const qm = s.match(/^Q([1-4])$/i);
  if (qm) {
    const ends = [{ m: 3, d: 31 }, { m: 6, d: 30 }, { m: 9, d: 30 }, { m: 12, d: 31 }];
    const q = ends[parseInt(qm[1]) - 1];
    return `${year}-${String(q.m).padStart(2, "0")}-${q.d}`;
  }

  // Strip parenthetical annotations: "Jan 12 (paid)" → "Jan 12"
  let cleaned = s.replace(/\s*\([^)]*\)/g, "").trim();

  // 2-digit year at end: "April 22, 25" or "Sept 28, 22"
  cleaned = cleaned.replace(/,?\s*\b(\d{2})\s*$/, (_, y2) => `, ${2000 + parseInt(y2)}`);

  // No 4-digit year → append sheet year: "May 1" → "May 1 2025"
  if (!/\b\d{4}\b/.test(cleaned)) cleaned = `${cleaned} ${year}`;

  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return `${year}-06-15`;
}

/** Parse all deal rows from a tracker sheet.
 *  Returns deals (empty if not a tracker sheet) and the auto-detected brokerage split. */
function parseTrackerSheet(
  rows: string[][],
  sheetYear: number,
): { deals: import("@/app/api/import-history/route").ExtractedDeal[]; detectedSplit: number | null } {
  const hdrs = findTrackerHeaders(rows);
  if (!hdrs) return { deals: [], detectedSplit: null };

  // The primary column for GCI is the GCI column (pre-split).
  // If no dedicated GCI column exists, fall back to Net Commission.
  const moneyCol = hdrs.gciCol >= 0 ? hdrs.gciCol : hdrs.netCol;

  const deals: import("@/app/api/import-history/route").ExtractedDeal[] = [];
  const splitRatios: number[] = [];

  for (let i = hdrs.rowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const name = row[hdrs.nameCol]?.trim() ?? "";

    // Skip blank / total / header rows
    if (!name || /^(totals?|number|name|transaction|$)/i.test(name)) continue;

    // Strip $ and commas: "$14,500" → 14500
    const rawGCI = (row[moneyCol] ?? "").replace(/[$,\s]/g, "");
    const gci = parseFloat(rawGCI) || 0;
    if (gci <= 0) continue;

    // Collect split ratios when both GCI and Net columns exist
    if (hdrs.gciCol >= 0 && hdrs.netCol >= 0) {
      const rawNet = (row[hdrs.netCol] ?? "").replace(/[$,\s]/g, "");
      const netVal = parseFloat(rawNet) || 0;
      if (netVal > 0 && netVal < gci) {
        splitRatios.push(netVal / gci);
      }
    }

    const rawSide = (row[hdrs.sideCol] ?? "").toLowerCase();
    const side: import("@/app/api/import-history/route").ExtractedDeal["side"] =
      rawSide.includes("sell") && rawSide.includes("buy") ? "both"
      : rawSide.includes("sell") ? "seller"
      : rawSide.includes("buy") || rawSide.includes("rent") ? "buyer"
      : undefined;

    const source  = (hdrs.sourceCol >= 0 ? row[hdrs.sourceCol]?.trim() : "") || undefined;
    const address = (hdrs.addrCol   >= 0 ? row[hdrs.addrCol]?.trim()   : "") ?? "";
    const rawDate = (hdrs.dateCol   >= 0 ? row[hdrs.dateCol]?.trim()   : "") ?? "";

    deals.push({
      date:       parseTrackerDate(rawDate, sheetYear),
      address,
      gci,
      party_a:    name,
      party_b:    "",
      agent_side: 0 as const,
      source,
      side,
    });
  }

  // Detect split: take the median ratio and snap to nearest common split
  let detectedSplit: number | null = null;
  if (splitRatios.length >= 2) {
    const sorted = [...splitRatios].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const commonSplits = [0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00];
    detectedSplit = commonSplits.reduce((best, s) =>
      Math.abs(s - median) < Math.abs(best - median) ? s : best
    );
  }

  return { deals, detectedSplit };
}

/** Compute quarterly/annual aggregates in the browser (same logic as the server). */
function computeLocalAggregates(
  deals: import("@/app/api/import-history/route").ExtractedDeal[],
  year: number,
  splitPct?: number,
): import("@/app/api/import-history/route").ImportResult {
  const quarter_gci: [number, number, number, number] = [0, 0, 0, 0];
  const quarter_tx:  [number, number, number, number] = [0, 0, 0, 0];

  for (const deal of deals) {
    const d = new Date(deal.date + "T12:00:00");
    if (d.getFullYear() !== year) continue;
    const q = Math.floor(d.getMonth() / 3) as 0 | 1 | 2 | 3;
    quarter_gci[q] = Math.round((quarter_gci[q] + deal.gci) * 100) / 100;
    quarter_tx[q]++;
  }

  return {
    year,
    annual_gci: Math.round(deals.reduce((s, d) => s + d.gci, 0) * 100) / 100,
    annual_tx:  deals.length,
    quarter_gci,
    quarter_tx,
    deals,
    split_pct: splitPct,
  };
}
