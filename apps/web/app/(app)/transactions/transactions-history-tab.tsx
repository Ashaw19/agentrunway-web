"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
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
  BarChart2,
  Clipboard,
} from "lucide-react";
import { fmtCurrency } from "@/lib/formatters";
import { computeGCI, type HistoryItem, type Transaction, type UserSettings } from "@/lib/types/database";
import { cn } from "@/lib/utils";
import type { ImportResult } from "@/app/api/import-history/route";
import { computeImportExternalId } from "@/lib/import/external-id";
import dynamic from "next/dynamic";
import type { YoYDataPoint } from "@/components/year-over-year-chart";

const ProductionReportDialog = dynamic(() => import("@/components/production-report-dialog").then(m => m.ProductionReportDialog), { ssr: false });
const YearOverYearChart = dynamic(() => import("@/components/year-over-year-chart").then(m => m.YearOverYearChart), { ssr: false });
import { Download } from "lucide-react";

interface Props {
  historyItems: HistoryItem[];
  transactions: Transaction[];
  /** Agent's split decimal from Settings (e.g. 0.75), or null if not set. Used as the
   *  pre-fill default for per-year split selectors; null shows "Select split…" prompt. */
  settingsSplit: number | null;
  /** Full user settings — used by the production report dialog. */
  settings: UserSettings | null;
}

// Per-quarter colour config
const QUARTER_STYLES = [
  { label: "Q1", border: "border-blue-200",   bg: "bg-blue-50",   heading: "text-blue-700",   ring: "focus-visible:ring-blue-400",   bar: "bg-blue-400"   },
  { label: "Q2", border: "border-amber-200",  bg: "bg-amber-50",  heading: "text-amber-700",  ring: "focus-visible:ring-amber-400",  bar: "bg-amber-400"  },
  { label: "Q3", border: "border-emerald-200",bg: "bg-emerald-50",heading: "text-emerald-700",ring: "focus-visible:ring-emerald-400", bar: "bg-emerald-400" },
  { label: "Q4", border: "border-violet-200", bg: "bg-violet-50", heading: "text-violet-700", ring: "focus-visible:ring-violet-400",  bar: "bg-violet-400"  },
];

// ── Seasonal profile helper ───────────────────────────────────────────────────
interface SeasonalProfile {
  avgGCI:     number[];  // [Q1..Q4] avg GCI across years with data
  avgTx:      number[];  // [Q1..Q4] avg deal count
  pcts:       number[];  // [Q1..Q4] fraction of annual total (sums to 1)
  strongestQ: number;    // index of highest-GCI quarter
  weakestQ:   number;    // index of lowest-GCI quarter
  yearCount:  number;    // how many years had quarterly data
}

function buildSeasonalProfile(items: HistoryItem[]): SeasonalProfile | null {
  const withData = items.filter((it) =>
    (it.quarter_gci ?? []).some((v) => (v ?? 0) > 0),
  );
  if (withData.length === 0) return null;

  const avgGCI = [0, 1, 2, 3].map((q) =>
    withData.reduce((sum, it) => sum + ((it.quarter_gci ?? [])[q] ?? 0), 0) /
    withData.length,
  );
  const avgTx = [0, 1, 2, 3].map((q) =>
    withData.reduce((sum, it) => sum + ((it.quarter_tx ?? [])[q] ?? 0), 0) /
    withData.length,
  );
  const totalAvg = avgGCI.reduce((a, b) => a + b, 0);
  const pcts =
    totalAvg > 0
      ? avgGCI.map((v) => v / totalAvg)
      : [0.25, 0.25, 0.25, 0.25];
  const strongestQ = pcts.indexOf(Math.max(...pcts));
  const weakestQ   = pcts.indexOf(Math.min(...pcts));

  return { avgGCI, avgTx, pcts, strongestQ, weakestQ, yearCount: withData.length };
}

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

export function TransactionsHistoryTab({ historyItems: initial, transactions, settingsSplit, settings }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { userIdRef.current = user?.id ?? null; });
  }, [supabase]);
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

  // ── Production report dialog state ───────────────────────────────────────
  const [reportOpen, setReportOpen] = useState(false);

  // ── Split selection state ─────────────────────────────────────────────────
  // Default from the user's Settings split; null = "Select split…" placeholder shown.
  // Auto-detected splits (from GCI/Net ratio in the spreadsheet) take precedence.
  const [addSplitPct,    setAddSplitPct]    = useState<number | null>(settingsSplit);
  const [importSplitPct, setImportSplitPct] = useState<number | null>(settingsSplit);
  const [importIsImage,  setImportIsImage]  = useState(false); // true = PDF/image (amounts already net)
  const [batchSplitPcts, setBatchSplitPcts] = useState<Record<number, number | null>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group transactions by year for auto-derived stats
  const txByYear = transactions.reduce<Record<number, Transaction[]>>(
    (acc, tx) => {
      const y = parseInt(tx.date.slice(0, 4), 10);
      (acc[y] ??= []).push(tx);
      return acc;
    },
    {},
  );

  // Seasonal profile — recomputes whenever items changes
  const seasonalProfile = buildSeasonalProfile(items);

  // ── Year-over-year chart data ─────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const yoyData: YoYDataPoint[] = [
    // Historical items sorted oldest → newest
    ...[...items]
      .sort((a, b) => a.year - b.year)
      .map((it) => ({
        year: it.year,
        gci: it.annual_gci,
        deals: it.annual_tx,
        isCurrentYear: it.year === currentYear,
      })),
    // If no history item exists for the current year, add current-year actuals from transactions
    ...(items.some((it) => it.year === currentYear)
      ? []
      : (() => {
          const thisYearTx = transactions.filter((tx) =>
            tx.date.startsWith(String(currentYear)),
          );
          if (thisYearTx.length === 0) return [];
          return [
            {
              year: currentYear,
              gci: thisYearTx.reduce((sum, tx) => sum + computeGCI(tx), 0),
              deals: thisYearTx.length,
              isCurrentYear: true,
            },
          ];
        })()),
  ];

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function toggleLock(item: HistoryItem) {
    const uid = userIdRef.current;
    if (!uid) return;
    const { error } = await supabase
      .from("history_items")
      .update({ is_locked: !item.is_locked })
      .eq("id", item.id)
      .eq("user_id", uid);
    if (error) {
      toast.error("Failed to update lock — please try again.");
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, is_locked: !i.is_locked } : i,
      ),
    );
    toast(item.is_locked ? "Year unlocked ✓" : "Year locked 🔒");
  }

  // ── Inline edit helpers ──────────────────────────────────────────────────
  // Optimistic update with rollback on failure.

  async function updateAnnualGCI(item: HistoryItem, value: string) {
    const num = parseFloat(value) || 0;
    const prev = item.annual_gci;
    setItems((p) => p.map((i) => i.id === item.id ? { ...i, annual_gci: num } : i));
    setSaving(`${item.id}-annual_gci`);
    const uid = userIdRef.current;
    if (!uid) return;
    const { error } = await supabase.from("history_items").update({ annual_gci: num }).eq("id", item.id).eq("user_id", uid);
    if (error) { setItems((p) => p.map((i) => i.id === item.id ? { ...i, annual_gci: prev } : i)); toast.error("Failed to save — please try again."); }
    setSaving(null);
  }

  async function updateAnnualTx(item: HistoryItem, value: string) {
    const num = parseInt(value) || 0;
    const prev = item.annual_tx;
    setItems((p) => p.map((i) => i.id === item.id ? { ...i, annual_tx: num } : i));
    setSaving(`${item.id}-annual_tx`);
    const uid = userIdRef.current;
    if (!uid) return;
    const { error } = await supabase.from("history_items").update({ annual_tx: num }).eq("id", item.id).eq("user_id", uid);
    if (error) { setItems((p) => p.map((i) => i.id === item.id ? { ...i, annual_tx: prev } : i)); toast.error("Failed to save — please try again."); }
    setSaving(null);
  }

  async function updateQuarterGCI(item: HistoryItem, qi: number, value: string) {
    const num = parseFloat(value) || 0;
    const prevArr = [...(item.quarter_gci as number[])];
    const newArr = [...prevArr];
    newArr[qi] = num;
    setItems((p) => p.map((i) => i.id === item.id ? { ...i, quarter_gci: newArr } : i));
    setSaving(`${item.id}-qgci-${qi}`);
    const uid = userIdRef.current;
    if (!uid) return;
    const { error } = await supabase.from("history_items").update({ quarter_gci: newArr }).eq("id", item.id).eq("user_id", uid);
    if (error) { setItems((p) => p.map((i) => i.id === item.id ? { ...i, quarter_gci: prevArr } : i)); toast.error("Failed to save — please try again."); }
    setSaving(null);
  }

  async function updateQuarterTx(item: HistoryItem, qi: number, value: string) {
    const num = parseInt(value) || 0;
    const prevArr = [...(item.quarter_tx as number[])];
    const newArr = [...prevArr];
    newArr[qi] = num;
    setItems((p) => p.map((i) => i.id === item.id ? { ...i, quarter_tx: newArr } : i));
    setSaving(`${item.id}-qtx-${qi}`);
    const uid = userIdRef.current;
    if (!uid) return;
    const { error } = await supabase.from("history_items").update({ quarter_tx: newArr }).eq("id", item.id).eq("user_id", uid);
    if (error) { setItems((p) => p.map((i) => i.id === item.id ? { ...i, quarter_tx: prevArr } : i)); toast.error("Failed to save — please try again."); }
    setSaving(null);
  }

  async function handleAddYear() {
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Delete the history_items row first.
    const { error: historyError } = await supabase
      .from("history_items")
      .delete()
      .eq("id", item.id)
      .eq("user_id", user.id);

    if (historyError) {
      toast.error("Couldn't delete year — please try again.");
      return;
    }

    // history_items row removed — update local state immediately.
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setConfirmDeleteId(null);

    // 2. Cascade: delete imported transactions for this year.
    const { error: txError } = await supabase
      .from("transactions")
      .delete()
      .eq("user_id", user.id)
      .eq("source", "imported")
      .gte("date", `${item.year}-01-01`)
      .lte("date", `${item.year}-12-31`);

    if (txError) {
      toast.error(`${item.year} history removed, but some imported deals couldn't be deleted. Please refresh.`);
    }

    // 3. Cascade: delete client_records for this year.
    const { data: deletedRecords, error: crError } = await supabase
      .from("client_records")
      .delete()
      .eq("user_id", user.id)
      .eq("year", item.year)
      .select("client_id");

    if (crError) {
      toast.error(`${item.year} history removed, but some client records couldn't be deleted. Please refresh.`);
      return;
    }

    // 4. Orphan cleanup: if any client_records were deleted, check for clients
    //    that now have zero remaining records AND no other CRM data, then remove.
    //    Only delete import-created clients (imported_at IS NOT NULL) to avoid
    //    destroying manually-created clients with active activities/tasks/deals.
    if (deletedRecords && deletedRecords.length > 0) {
      const { data: remainingRecords } = await supabase
        .from("client_records")
        .select("client_id")
        .eq("user_id", user.id);

      const stillReferencedIds = new Set(
        (remainingRecords ?? []).map((r) => r.client_id).filter(Boolean)
      );

      const candidateIds = [
        ...new Set(deletedRecords.map((r) => r.client_id).filter(Boolean)),
      ];

      const orphanedIds = candidateIds.filter((id) => !stillReferencedIds.has(id));

      if (orphanedIds.length > 0) {
        // Double-check: only delete clients that were auto-created by import
        // (imported_at is set) AND have no pipeline deals referencing them.
        // This prevents cascade-deleting active CRM data.
        const { data: safeToDelete } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .in("id", orphanedIds)
          .not("imported_at", "is", null);

        const safeIds = (safeToDelete ?? []).map((c) => c.id);
        if (safeIds.length > 0) {
          const { data: linkedDeals } = await supabase
            .from("pipeline_deals")
            .select("client_id")
            .eq("user_id", user.id)
            .in("client_id", safeIds);
          const dealLinkedIds = new Set((linkedDeals ?? []).map((d) => d.client_id).filter(Boolean));
          const finalIds = safeIds.filter((id) => !dealLinkedIds.has(id));

          if (finalIds.length > 0) {
            await supabase
              .from("clients")
              .delete()
              .eq("user_id", user.id)
              .in("id", finalIds);
          }
        }
      }
    }

    toast.success(`${item.year} removed from history.`);
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
    // 20 MB limit — generous for PDFs and high-res scans
    const MAX_MB = 20;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_MB} MB.`);
      return;
    }

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
      // Multi-page images for scanned PDFs (sent as images[] to the API)
      let multiPageImages: Array<{ base64: string; mimeType: string; page: number }> | undefined;

      if (fileType === "pdf") {
        // ── PDF: extract text layer first (all pages); fall back to image OCR ──
        // Strategy:
        //   1. Try pdfjs text layer for every page → send as textContent (best quality)
        //   2. If text layer is mostly empty (scanned PDF) → render all pages as JPEG
        //      and send as images[] so the vision model sees the full document.
        //   3. If pdfjs fails entirely (e.g. unsupported color space in older PDFs) →
        //      send the raw PDF bytes to the API for Claude's native document handling.
        const pdfArrayBuffer = await file.arrayBuffer();
        try {
          const pdfjsLib = await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfArrayBuffer) }).promise;

          // Pass 1: extract text layer from every page
          const pageTexts: string[] = [];
          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const tc   = await page.getTextContent();
            const text = (tc.items as Array<{ str?: string }>)
              .map((item) => item.str ?? "")
              .join(" ")
              .trim();
            pageTexts.push(text);
          }

          // Count non-whitespace characters across all pages to decide path
          const combined     = pageTexts.join("\n\n--- Page Break ---\n\n");
          const usableChars  = combined.replace(/\s/g, "").length;

          if (usableChars >= 200) {
            // Text layer is usable — send as plain text (better structured input for LLM)
            textContent = combined;
          } else {
            // Scanned PDF — render all pages (up to 5) as images
            const MAX_VISION_PAGES = 5;
            const totalPages = Math.min(pdf.numPages, MAX_VISION_PAGES);
            const pages: typeof multiPageImages = [];

            for (let p = 1; p <= totalPages; p++) {
              const page     = await pdf.getPage(p);
              const scale    = 2.0;
              const viewport = page.getViewport({ scale });
              const canvas   = document.createElement("canvas");
              canvas.width   = viewport.width;
              canvas.height  = viewport.height;
              await page.render({ canvas, viewport }).promise;
              pages.push({
                base64:   canvas.toDataURL("image/jpeg", 0.90).split(",")[1],
                mimeType: "image/jpeg",
                page:     p,
              });
            }

            if (pages.length === 1) {
              imageBase64 = pages[0].base64;
              mimeType    = "image/jpeg";
            } else {
              multiPageImages = pages;
            }
          }
        } catch (pdfjsErr) {
          // PDF.js can fail on PDFs that use uncommon color spaces or features
          // (e.g. "n.toHex is not a function" on older brokerage reports).
          // Fall back to sending the raw PDF bytes to the API for Claude's native
          // document handling, which works on any valid PDF regardless of features.
          console.warn("[import] pdfjs failed, falling back to native PDF path:", pdfjsErr);

          // Vercel serverless functions have a 4.5 MB request body limit.
          // Base64 encoding adds ~33% overhead, so PDFs over ~3 MB raw will
          // exceed the limit when wrapped in JSON. Guard against this.
          const MAX_PDF_RAW_BYTES = 3 * 1024 * 1024; // 3 MB → ~4 MB base64 in JSON
          if (file.size > MAX_PDF_RAW_BYTES) {
            throw new Error(
              "This PDF is too large for direct processing. " +
              "Please try exporting it as images or a smaller file.",
            );
          }

          // Re-read from file — pdfjs transfers the ArrayBuffer to its worker,
          // detaching it from the main thread, so pdfArrayBuffer is no longer usable.
          const freshBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(freshBuffer);
          let binary = "";
          bytes.forEach((b) => (binary += String.fromCharCode(b)));
          imageBase64 = btoa(binary);
          mimeType    = "application/pdf";
        }

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
            // Priority: auto-detected from spreadsheet → user's Settings split → null (user must choose)
            acc[r.year] = detectedSplitMap[r.year] ?? r.split_pct ?? settingsSplit ?? null;
            return acc;
          }, {} as Record<number, number | null>));
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
        textContent = (await file.text()).replace(/^\uFEFF/, ""); // strip UTF-8 BOM
        // Detect potential Latin-1 / Windows-1252 encoding: UTF-8 decode failures
        // produce U+FFFD replacement chars. Common with CSVs from older Canadian
        // real-estate software (Lone Wolf, RE/MAX legacy exports). Mirrors the
        // sibling importer at history-content.tsx so accented client names don't
        // corrupt silently on import.
        if (textContent.includes("\uFFFD")) {
          toast.warning(
            "This file may not be saved as UTF-8 \u2014 accented characters (\u00E9, \u00E0, \u00E7) may appear incorrectly in client names. For best results, re-save as UTF-8 CSV before importing.",
            { duration: 9000 },
          );
        }
      }

      setImportStatus("extracting");

      const res = await fetch("/api/import-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          textContent,
          ...(multiPageImages && { images: multiPageImages }),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Extraction failed");
      }

      const rawData = await res.json();

      // ── Multi-year response: API splits deals by year automatically ──
      if (rawData.multi_year && Array.isArray(rawData.years)) {
        const years = rawData.years as ImportResult[];
        setBatchImportData(years);
        const pcts: Record<number, number | null> = {};
        years.forEach((yr) => { pcts[yr.year] = yr.split_pct ?? settingsSplit ?? null; });
        setBatchSplitPcts(pcts);
        setImportStatus("preview");
      } else {
        // Single-year response (original behavior)
        const data = rawData as ImportResult;

        // Pre-populate agent_side selections from Groq's best guess
        const sides: Record<number, 0 | 1> = {};
        data.deals.forEach((deal, i) => {
          if (deal.agent_side === 0 || deal.agent_side === 1) {
            sides[i] = deal.agent_side;
          }
        });

        setImportData(data);
        // Priority: auto-detected from spreadsheet → user's Settings split → null (user must choose)
        setImportSplitPct(data.split_pct ?? settingsSplit ?? null);
        // Vision-based imports (image upload or scanned PDF) have net amounts already baked in
        const isImage = fileType === "image" || !!(imageBase64 || multiPageImages);
        setImportIsImage(isImage);
        // Vision/image = brokerage report with net amounts already; default split to 100%
        if (isImage) setImportSplitPct(1.00);
        setAgentSides(sides);
        setImportStatus("preview");
      }
    } catch (err) {
      console.error("[import] error:", err);
      const msg = err instanceof Error ? err.message : "Couldn't read the file";
      toast.error(msg || "Couldn't read the file — please try again.");
      setImportStatus("idle");
      setImportOpen(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSaveImport() {
    if (!importData) return;
    setImportStatus("saving");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setImportStatus("preview"); toast.error("Session expired — please sign in again."); return; }

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
      // MERGE strategy (not delete-then-insert):
      //   • Each imported row gets a stable `import_external_id` fingerprint.
      //   • If a row with that ID already exists AND has `edited_at` set,
      //     SKIP it — the user edited it manually post-import and we don't
      //     want to stomp their correction.
      //   • Otherwise UPSERT on (user_id, import_external_id) so re-uploads
      //     of the same document overwrite in place; a second CSV for the
      //     same year appends alongside instead of wiping the first upload.
      //   Fixes Bug A (multi-file same year) + Bug B (manual edits lost).

      // ── Upsert client identities, then attach client_id to each record ────
      const dealNames = importData.deals
        .map((deal, i) => {
          const sideSelected = agentSides[i] ?? deal.agent_side;
          return ((sideSelected === 1 ? deal.party_b : deal.party_a) ?? "").trim();
        })
        .filter(Boolean);
      const uniqueNames = [...new Set(dealNames)];

      if (uniqueNames.length > 0) {
        await supabase.from("clients").upsert(
          uniqueNames.map((name) => ({ user_id: user.id, name, name_search: name.toLowerCase() })),
          { onConflict: "user_id,name_search", ignoreDuplicates: true },
        );
      }
      const { data: clientRows } = uniqueNames.length > 0
        ? await supabase.from("clients").select("id, name_search").eq("user_id", user.id)
            .in("name_search", uniqueNames.map((n) => n.toLowerCase()))
        : { data: [] as { id: string; name_search: string }[] };
      const clientIdMap = new Map((clientRows ?? []).map((c) => [c.name_search, c.id]));

      const clientInserts = importData.deals
        .map((deal, i) => {
          const sideSelected = agentSides[i] ?? deal.agent_side;
          const clientName = ((sideSelected === 1 ? deal.party_b : deal.party_a) ?? "").trim();
          if (!clientName) return null;
          const dealExtId = computeImportExternalId({
            year:    importData.year,
            date:    deal.date,
            address: deal.address,
            party_a: deal.party_a,
            party_b: deal.party_b,
            gci:     deal.gci,
          });
          return {
            user_id: user.id,
            name: clientName,
            client_id: clientIdMap.get(clientName.toLowerCase()) ?? null,
            side: deal.side ?? null,
            source: deal.source ?? null,
            address: deal.address || null,
            close_date: deal.date || null,
            year: importData.year,
            gci: deal.gci,
            import_external_id: `${dealExtId}|c:${clientName.toLowerCase()}`,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (clientInserts.length > 0) {
        const crExtIds = clientInserts.map((r) => r.import_external_id);
        const { data: crExisting } = await supabase.from("client_records")
          .select("import_external_id, edited_at")
          .eq("user_id", user.id)
          .in("import_external_id", crExtIds);
        const editedCrIds = new Set(
          (crExisting ?? [])
            .filter((r) => r.edited_at !== null)
            .map((r) => r.import_external_id as string),
        );
        const crToUpsert = clientInserts.filter(
          (r) => !editedCrIds.has(r.import_external_id),
        );
        if (crToUpsert.length > 0) {
          const { error: crErr } = await supabase.from("client_records").upsert(
            crToUpsert,
            { onConflict: "user_id,import_external_id" },
          );
          if (crErr) {
            console.error("[import] client_records upsert failed:", crErr);
            toast.error("Failed to save client records. Please try again.");
            setImportStatus("preview");
            return;
          }
        }
      }

      // ── Write imported transactions (for tax engine, reporting, dashboard) ──
      // Same merge-not-replace strategy. Upsert on external_id; skip edited rows.
      const currentYear = new Date().getFullYear();
      if (importData.year < currentYear && importData.deals.length > 0) {
        const txInserts = importData.deals
          .map((d, i) => ({ deal: d, origIdx: i }))
          .filter(({ deal: d }) => d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.gci > 0)
          .map(({ deal: d, origIdx }) => {
            const side = agentSides[origIdx] ?? d.agent_side;
            const extId = computeImportExternalId({
              year:    importData.year,
              date:    d.date,
              address: d.address,
              party_a: d.party_a,
              party_b: d.party_b,
              gci:     d.gci,
            });
            return {
              user_id: user.id,
              date: d.date,
              address: d.address || "",
              sale_price: d.sale_price ?? null,
              commission_pct: d.commission_percent ?? null,
              gci_override: d.gci,
              side: (d.side ?? "buyer") as "buyer" | "seller" | "both",
              status: "closed" as const,
              client_name: ((side === 1 ? d.party_b : d.party_a) ?? "").trim() || "",
              notes: (side === 1 ? d.party_a : d.party_b)?.trim() ? `Other party: ${(side === 1 ? d.party_a : d.party_b)?.trim()}` : "",
              source: "imported" as const,
              date_precision: "day" as const,
              import_external_id: extId,
            };
          });

        if (txInserts.length > 0) {
          const txExtIds = txInserts.map((t) => t.import_external_id);
          const { data: txExisting } = await supabase.from("transactions")
            .select("import_external_id, edited_at")
            .eq("user_id", user.id)
            .in("import_external_id", txExtIds);
          const editedTxIds = new Set(
            (txExisting ?? [])
              .filter((r) => r.edited_at !== null)
              .map((r) => r.import_external_id as string),
          );
          const txToUpsert = txInserts.filter(
            (t) => !editedTxIds.has(t.import_external_id),
          );
          if (txToUpsert.length > 0) {
            const { error: txInsertErr } = await supabase.from("transactions").upsert(
              txToUpsert,
              { onConflict: "user_id,import_external_id" },
            );
            if (txInsertErr) {
              console.error("[import] transaction upsert failed:", txInsertErr);
              toast.error("Failed to save transactions. Please re-import this year.");
              setImportStatus("preview");
              return;
            }
          }
        }
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
          ? `${importData.year} history updated · ${clientInserts.length} clients merged ✓`
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setImportStatus("preview"); toast.error("Session expired — please sign in again."); return; }

    let savedYears = 0;
    let totalClients = 0;
    const failedYears: number[] = [];

    for (const yearData of batchImportData) {
      try {
      const effectiveSplit = batchSplitPcts[yearData.year] ?? yearData.split_pct ?? settingsSplit ?? null;
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

      // Save client records for this year — MERGE, not replace (see handleSaveImport)
      // ── Upsert client identities for this year, then attach client_id ─────
      // Use agent_side to pick the correct party — 1 = agent represented party_b
      const agentClientNames = yearData.deals.map((d) =>
        ((d.agent_side === 1 ? d.party_b : d.party_a) ?? "").trim()
      );
      const uniqueYearNames = [...new Set(agentClientNames.filter(Boolean))];
      if (uniqueYearNames.length > 0) {
        await supabase.from("clients").upsert(
          uniqueYearNames.map((name) => ({ user_id: user.id, name, name_search: name.toLowerCase() })),
          { onConflict: "user_id,name_search", ignoreDuplicates: true },
        );
      }
      const { data: yearClientRows } = uniqueYearNames.length > 0
        ? await supabase.from("clients").select("id, name_search").eq("user_id", user.id)
            .in("name_search", uniqueYearNames.map((n) => n.toLowerCase()))
        : { data: [] as { id: string; name_search: string }[] };
      const yearClientIdMap = new Map((yearClientRows ?? []).map((c) => [c.name_search, c.id]));

      const clientInserts = yearData.deals
        .filter((d) => {
          const clientName = ((d.agent_side === 1 ? d.party_b : d.party_a) ?? "").trim();
          return clientName.length > 0;
        })
        .map((d) => {
          const clientName = ((d.agent_side === 1 ? d.party_b : d.party_a) ?? "").trim();
          const dealExtId = computeImportExternalId({
            year:    yearData.year,
            date:    d.date,
            address: d.address,
            party_a: d.party_a,
            party_b: d.party_b,
            gci:     d.gci,
          });
          return {
            user_id: user.id,
            name: clientName,
            client_id: yearClientIdMap.get(clientName.toLowerCase()) ?? null,
            side: d.side ?? null,
            source: d.source ?? null,
            address: d.address || null,
            close_date: d.date || null,
            year: yearData.year,
            gci: d.gci,
            import_external_id: `${dealExtId}|c:${clientName.toLowerCase()}`,
          };
        });

      if (clientInserts.length > 0) {
        const crExtIds = clientInserts.map((r) => r.import_external_id);
        const { data: crExisting } = await supabase.from("client_records")
          .select("import_external_id, edited_at")
          .eq("user_id", user.id)
          .in("import_external_id", crExtIds);
        const editedCrIds = new Set(
          (crExisting ?? [])
            .filter((r) => r.edited_at !== null)
            .map((r) => r.import_external_id as string),
        );
        const crToUpsert = clientInserts.filter(
          (r) => !editedCrIds.has(r.import_external_id),
        );
        if (crToUpsert.length > 0) {
          const { error: crErr } = await supabase.from("client_records").upsert(
            crToUpsert,
            { onConflict: "user_id,import_external_id" },
          );
          if (crErr) throw crErr;
        }
        totalClients += clientInserts.length;
      }

      // ── Phase 2: write individual transactions for past years ─────────────
      // Current year stays manual-only (user tracks live deals themselves).
      const currentYear = new Date().getFullYear();
      if (yearData.year < currentYear && yearData.deals.length > 0) {
        const txInserts = yearData.deals
          .filter((d) => d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.gci > 0) // skip deals with no date, invalid date format, or $0 GCI
          .map((d) => {
            const extId = computeImportExternalId({
              year:    yearData.year,
              date:    d.date,
              address: d.address,
              party_a: d.party_a,
              party_b: d.party_b,
              gci:     d.gci,
            });
            return {
              user_id: user.id,
              date: d.date,
              address: d.address || "",
              sale_price: d.sale_price ?? null,
              commission_pct: d.commission_percent ?? null,
              gci_override: d.gci,     // store GCI directly
              side: (d.side ?? "buyer") as "buyer" | "seller" | "both",
              status: "closed" as const,
              client_name: ((d.agent_side === 1 ? d.party_b : d.party_a) ?? "").trim() || "",
              notes: (d.agent_side === 1 ? d.party_a : d.party_b)?.trim() ? `Other party: ${(d.agent_side === 1 ? d.party_a : d.party_b)?.trim()}` : "",
              source: "imported" as const,
              date_precision: "day" as const,
              import_external_id: extId,
            };
          });

        if (txInserts.length > 0) {
          const txExtIds = txInserts.map((t) => t.import_external_id);
          const { data: txExisting } = await supabase.from("transactions")
            .select("import_external_id, edited_at")
            .eq("user_id", user.id)
            .in("import_external_id", txExtIds);
          const editedTxIds = new Set(
            (txExisting ?? [])
              .filter((r) => r.edited_at !== null)
              .map((r) => r.import_external_id as string),
          );
          const txToUpsert = txInserts.filter(
            (t) => !editedTxIds.has(t.import_external_id),
          );
          if (txToUpsert.length > 0) {
            const { error: txInsertErr } = await supabase.from("transactions").upsert(
              txToUpsert,
              { onConflict: "user_id,import_external_id" },
            );
            if (txInsertErr) throw txInsertErr;
          }
        }
      }
      } catch (err) {
        console.error(`Failed to save year ${yearData.year}:`, err);
        failedYears.push(yearData.year);
      }
    }

    setImportOpen(false);
    setImportStatus("idle");
    setBatchImportData([]);
    if (failedYears.length > 0 && savedYears > 0) {
      toast.warning(
        `${savedYears} years imported, but ${failedYears.join(", ")} failed. Try importing those years again.`,
      );
    } else if (failedYears.length > 0) {
      toast.error("Import failed. Please try again.");
    } else {
      toast.success(
        `${savedYears} years imported · ${totalClients} clients saved to your database ✓`,
      );
    }
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

          {/* Generate Production Report */}
          {settings && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReportOpen(true)}
              disabled={items.length === 0}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Generate Report
            </Button>
          )}

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
                    value={addSplitPct ?? ""}
                    onChange={(e) => setAddSplitPct(e.target.value === "" ? null : Number(e.target.value))}
                    className="border border-input rounded-md h-10 px-3 text-sm bg-background w-full outline-none cursor-pointer"
                  >
                    <option value="" disabled>Select split…</option>
                    {SPLIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {addSplitPct === null && (
                  <p className="text-xs text-destructive">Select a brokerage split before saving.</p>
                )}
                <Button onClick={handleAddYear} disabled={addSplitPct === null}>Save &amp; Add Quarterly Data</Button>
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-800">
                    {batchImportData.length} years found in your career tracker
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Review each year below, then click Import to save all at once.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const lines: string[] = [];
                    batchImportData.forEach((yr) => {
                      lines.push(`\n── ${yr.year} — ${yr.annual_tx} deals — ${fmtCurrency(yr.annual_gci)} GCI ──`);
                      yr.deals.forEach((d, i) => {
                        const dt = new Date(d.date + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
                        const side = d.side ? ` | ${d.side.charAt(0).toUpperCase() + d.side.slice(1)}` : "";
                        const src  = d.source ? ` | ${d.source}` : "";
                        lines.push(`  #${String(i + 1).padStart(2, "0")} ${d.address || "(no address)"} | ${dt} | ${fmtCurrency(d.gci)} GCI${side}${src} | ${d.party_a || "—"}`);
                      });
                    });
                    navigator.clipboard.writeText(lines.join("\n"));
                    toast.success("All deals copied to clipboard");
                  }}
                  className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 transition-colors shrink-0 mt-0.5"
                >
                  <Clipboard className="h-3 w-3" />
                  Copy all
                </button>
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
                              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
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
                          value={batchSplitPcts[yr.year] ?? ""}
                          onChange={(e) => setBatchSplitPcts((prev) => ({ ...prev, [yr.year]: e.target.value === "" ? null : Number(e.target.value) }))}
                          className="text-[11px] border border-border rounded px-2 py-0.5 bg-card outline-none cursor-pointer"
                        >
                          <option value="" disabled>Select split…</option>
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
                <Button
                  onClick={handleBatchSave}
                  disabled={
                    importStatus === "saving" ||
                    batchImportData.some(
                      (yr) => (batchSplitPcts[yr.year] ?? yr.split_pct ?? settingsSplit ?? null) === null
                    )
                  }
                >
                  {importStatus === "saving" ? (
                    <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</>
                  ) : batchImportData.some(
                      (yr) => (batchSplitPcts[yr.year] ?? yr.split_pct ?? settingsSplit ?? null) === null
                    ) ? (
                    "Select split for each year above"
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
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {importIsImage
                      ? "Importing from a T4A or brokerage report? Amounts are already net — choose 100%."
                      : "Your share of each commission this year"}
                  </p>
                </div>
                <select
                  value={importSplitPct ?? ""}
                  onChange={(e) => setImportSplitPct(e.target.value === "" ? null : Number(e.target.value))}
                  className="text-sm border border-input rounded-md px-2.5 py-1.5 bg-background outline-none cursor-pointer shrink-0"
                >
                  <option value="" disabled>Select split…</option>
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

              {/* Low-confidence summary hint */}
              {importData.deals.some((d) => d.confidence && (
                d.confidence.gci === "missing" || d.confidence.gci === "low" ||
                d.confidence.sale_price === "missing" ||
                d.confidence.address === "missing" || d.confidence.address === "low"
              )) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-700">
                    Some deals are missing details (marked below). Don&apos;t worry — you can edit any field after saving.
                  </p>
                </div>
              )}

              {/* Deal-by-deal review */}
              <div>
                {/* Only show party-selection header when party_b data is present */}
                {importData.deals.some((d) => d.party_b) ? (
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-slate-500" />
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Deals — tap to select which party was your client
                      </p>
                    </div>
                    <button
                      title="Copy all deals to clipboard"
                      onClick={() => {
                        const lines = [
                          `${importData.year} Import Preview — ${importData.annual_tx} deals — ${fmtCurrency(importData.annual_gci)} GCI`,
                          "",
                          ...importData.deals.map((d, i) => {
                            const dt = new Date(d.date + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
                            const side = d.side ? ` | ${d.side.charAt(0).toUpperCase() + d.side.slice(1)}` : "";
                            const src = d.source ? ` | ${d.source}` : "";
                            return `#${String(i+1).padStart(2,"0")} ${d.address || "(no address)"} | ${dt} | ${fmtCurrency(d.gci)} GCI${side}${src} | ${d.party_a || "—"}`;
                          }),
                        ];
                        navigator.clipboard.writeText(lines.join("\n"));
                        toast.success("Deals copied to clipboard");
                      }}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Clipboard className="h-3 w-3" />
                      Copy
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-slate-500" />
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Deals
                      </p>
                    </div>
                    <button
                      title="Copy all deals to clipboard"
                      onClick={() => {
                        const lines = [
                          `${importData.year} Import Preview — ${importData.annual_tx} deals — ${fmtCurrency(importData.annual_gci)} GCI`,
                          "",
                          ...importData.deals.map((d, i) => {
                            const dt = new Date(d.date + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
                            const side = d.side ? ` | ${d.side.charAt(0).toUpperCase() + d.side.slice(1)}` : "";
                            const src = d.source ? ` | ${d.source}` : "";
                            return `#${String(i+1).padStart(2,"0")} ${d.address || "(no address)"} | ${dt} | ${fmtCurrency(d.gci)} GCI${side}${src} | ${d.party_a || "—"}`;
                          }),
                        ];
                        navigator.clipboard.writeText(lines.join("\n"));
                        toast.success("Deals copied to clipboard");
                      }}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Clipboard className="h-3 w-3" />
                      Copy
                    </button>
                  </div>
                )}

                {/* Two-party (brokerage) format — keep interactive cards */}
                {importData.deals.some((d) => d.party_b) ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {importData.deals.map((deal, i) => {
                      const selected = agentSides[i];
                      const date = new Date(deal.date + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
                      const sideBadge =
                        deal.side === "buyer"  ? { label: "Buyer",  cls: "bg-teal-50 text-teal-700 border-teal-200" }
                        : deal.side === "seller" ? { label: "Seller", cls: "bg-amber-50 text-amber-700 border-amber-200" }
                        : deal.side === "both"   ? { label: "Both",   cls: "bg-violet-50 text-violet-700 border-violet-200" }
                        : null;
                      return (
                        <div key={i} className="rounded-xl border border-border/60 bg-card px-3 py-2.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-foreground truncate">{deal.address}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <p className="text-[11px] text-muted-foreground">{date} · {fmtCurrency(deal.gci)} GCI</p>
                                {sideBadge && <span className={cn("text-[10px] font-semibold border rounded-full px-2.5 py-0.5", sideBadge.cls)}>{sideBadge.label}</span>}
                                {deal.source && <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5">{deal.source}</span>}
                              </div>
                            </div>
                            <span className="text-[10px] font-medium text-slate-400 shrink-0 tabular-nums">#{String(i + 1).padStart(2, "0")}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button type="button" onClick={() => setAgentSides((prev) => ({ ...prev, [i]: 0 }))}
                              className={cn("rounded-lg border px-2 py-1.5 text-left text-[11px] leading-snug transition-all",
                                selected === 0 ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/5")}>
                              <span className="block text-[10px] font-bold uppercase tracking-wide mb-0.5 opacity-60">{selected === 0 ? "✓ My Client" : "Party A"}</span>
                              {deal.party_a}
                            </button>
                            <button type="button" onClick={() => setAgentSides((prev) => ({ ...prev, [i]: 1 }))}
                              className={cn("rounded-lg border px-2 py-1.5 text-left text-[11px] leading-snug transition-all",
                                selected === 1 ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/5")}>
                              <span className="block text-[10px] font-bold uppercase tracking-wide mb-0.5 opacity-60">{selected === 1 ? "✓ My Client" : "Party B"}</span>
                              {deal.party_b}
                            </button>
                          </div>
                          {/* Low-confidence helper hints */}
                          {deal.confidence && (() => {
                            const hints: string[] = [];
                            if (deal.confidence.gci === "missing" || deal.confidence.gci === "low") hints.push("Missing or uncertain GCI");
                            if (deal.confidence.sale_price === "missing") hints.push("Missing sale price");
                            if (deal.confidence.address === "missing" || deal.confidence.address === "low") hints.push("Missing or uncertain address");
                            if (deal.confidence.date === "low") hints.push("Uncertain closing date");
                            if (deal.confidence.names === "low") hints.push("Uncertain client name");
                            if (hints.length === 0) return null;
                            return (
                              <p className="text-[10px] text-amber-600 flex items-start gap-1">
                                <AlertCircle className="h-3 w-3 mt-px shrink-0" />
                                {hints.join(" · ")} — you can edit this after saving
                              </p>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Single-party (agent tracker) format — compact table, all deals visible at once */
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border/60">
                          <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-slate-500 w-6">#</th>
                          <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-slate-500">Address</th>
                          <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-slate-500 whitespace-nowrap">Date</th>
                          <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-slate-500 whitespace-nowrap">GCI</th>
                          <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-slate-500">Side</th>
                          <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-slate-500">Client</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importData.deals.map((deal, i) => {
                          const date = new Date(deal.date + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
                          const sideBadge =
                            deal.side === "buyer"  ? { label: "Buyer",  cls: "text-teal-700" }
                            : deal.side === "seller" ? { label: "Seller", cls: "text-amber-700" }
                            : deal.side === "both"   ? { label: "Both",   cls: "text-violet-700" }
                            : null;
                          const hints: string[] = [];
                          if (deal.confidence) {
                            if (deal.confidence.gci === "missing" || deal.confidence.gci === "low") hints.push("Missing or uncertain GCI");
                            if (deal.confidence.sale_price === "missing") hints.push("Missing sale price");
                            if (deal.confidence.address === "missing" || deal.confidence.address === "low") hints.push("Missing or uncertain address");
                            if (deal.confidence.date === "low") hints.push("Uncertain closing date");
                            if (deal.confidence.names === "low") hints.push("Uncertain client name");
                          }
                          return (
                            <React.Fragment key={i}>
                            <tr className={cn("border-b border-border/40 last:border-0", i % 2 === 0 ? "bg-card" : "bg-muted/20")}>
                              <td className="px-2 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                              <td className="px-2 py-1.5 font-medium text-foreground max-w-[140px] truncate">{deal.address || <span className="text-slate-400 italic">—</span>}</td>
                              <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{date}</td>
                              <td className="px-2 py-1.5 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{fmtCurrency(deal.gci)}</td>
                              <td className="px-2 py-1.5">
                                {sideBadge
                                  ? <span className={cn("font-semibold", sideBadge.cls)}>{sideBadge.label}</span>
                                  : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-2 py-1.5 text-foreground max-w-[120px] truncate">{deal.party_a || <span className="text-slate-400 italic">—</span>}</td>
                            </tr>
                            {hints.length > 0 && (
                              <tr className="bg-amber-50/50">
                                <td colSpan={6} className="px-2 py-1 text-[10px] text-amber-600">
                                  <span className="flex items-center gap-1">
                                    <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                                    {hints.join(" · ")} — you can edit this after saving
                                  </span>
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

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
                  disabled={importStatus === "saving" || importSplitPct === null}
                >
                  {importStatus === "saving" ? (
                    <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</>
                  ) : importSplitPct === null ? (
                    "Select brokerage split above"
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

      {/* ── Year-over-year chart ──────────────────────────────────────────── */}
      {yoyData.length >= 2 && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Year-over-Year Performance</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">GCI (bars) &middot; Deals (line)</span>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <YearOverYearChart data={yoyData} height={240} />
            {yoyData.some((d) => d.isCurrentYear) && (
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground/70">
                Light bar = current year (partial)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Seasonal Profile ──────────────────────────────────────────────── */}
      {seasonalProfile && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Seasonal Profile</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                avg. across {seasonalProfile.yearCount}{" "}
                {seasonalProfile.yearCount === 1 ? "year" : "years"} of quarterly data
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {QUARTER_STYLES.map((qs, q) => (
                <div
                  key={q}
                  className={`relative rounded-xl border p-4 ${qs.border} ${qs.bg}`}
                >
                  {q === seasonalProfile.strongestQ && (
                    <span className="absolute right-2.5 top-2.5 rounded-full border border-slate-200 bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">
                      Best
                    </span>
                  )}
                  <p className={`text-xs font-bold uppercase tracking-widest ${qs.heading}`}>
                    {qs.label}
                  </p>
                  <p className="mt-1.5 text-xl font-bold text-slate-800">
                    {fmtCurrency(seasonalProfile.avgGCI[q])}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(seasonalProfile.avgTx[q] * 10) / 10} deals avg
                  </p>
                  {/* Relative-share bar */}
                  <div className="mt-3 h-1.5 w-full rounded-full bg-white/70">
                    <div
                      className={`h-1.5 rounded-full ${qs.bar}`}
                      style={{ width: `${Math.round(seasonalProfile.pcts[q] * 100)}%` }}
                    />
                  </div>
                  <p className={`mt-1 text-xs font-semibold ${qs.heading}`}>
                    {Math.round(seasonalProfile.pcts[q] * 100)}% of annual
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
            const importedDeals = yearTx.filter((tx) => tx.source === "imported");

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
                      {importedDeals.length > 0 && (
                        <Badge className="bg-indigo-50 text-indigo-700 text-xs border border-indigo-200 hover:bg-indigo-50">
                          {importedDeals.length} deal{importedDeals.length !== 1 ? "s" : ""} imported
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
                        {quarterGCISum > 0 && Math.abs(quarterGCISum - item.annual_gci) > 100 && !item.is_locked && (
                          <button
                            className="text-[11px] text-amber-600 hover:text-amber-700 underline underline-offset-2 cursor-pointer"
                            onClick={async () => {
                              await updateAnnualGCI(item, String(quarterGCISum));
                              await updateAnnualTx(item, String(quarterTxSum));
                              toast.success("Annual totals synced to quarterly sum ✓");
                            }}
                          >
                            ∑Q = {fmtCurrency(quarterGCISum)} — click to sync
                          </button>
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

                    {/* ── Imported deals list ──────────────────────────────── */}
                    {importedDeals.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
                          Imported Deals ({importedDeals.length})
                        </p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {importedDeals.map((tx) => (
                            <div
                              key={tx.id}
                              className="rounded-lg border border-border/60 bg-card px-3 py-2 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">
                                  {tx.address || "—"}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {tx.date} · {tx.client_name || <span className="text-amber-600">no client</span>}
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-emerald-700 shrink-0">
                                {fmtCurrency(computeGCI(tx))}
                              </span>
                            </div>
                          ))}
                        </div>
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
                            <span className="text-xs text-red-600 font-medium mr-1">
                              Delete {item.year}? This will permanently remove your {item.year} history summary, all imported deals from that year, and any client records that only exist in {item.year}. This cannot be undone.
                            </span>
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

      {/* ── Production Report Dialog ──────────────────────────────────────── */}
      {settings && (
        <ProductionReportDialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          historyItems={items}
          settings={settings}
        />
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
  // Strip spaces, pipes, $, commas, #, and brackets so headers like
  // "Gross Commission Income [GCI]" normalise to "grosscommissionincomegci"
  return h.toLowerCase().replace(/[\s|$,#\[\]()]/g, "");
}

/** Find the header row and column indices for the agent tracker format. */
function findTrackerHeaders(rows: string[][]): TrackerHeaders | null {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const hdrs = rows[i].map(normaliseHeader);
    // Match "Name", "Client Name", "Client", "Buyer Name", "Seller Name", etc.
    const nameCol = hdrs.findIndex((h) =>
      h === "name" || h === "client" || h.endsWith("name") || h.startsWith("client"),
    );
    // Match "Buyer/Seller", "Sell/Buy", "Side", "Transaction Type", "Role", etc.
    const sideCol = hdrs.findIndex((h) =>
      h.startsWith("buy") || h.startsWith("sell") || h.startsWith("rent") ||
      h === "side" || h.includes("transtype") || h.includes("dealtype"),
    );
    // Primary: dedicated GCI column (pre-split); fallback: Net Commission (post-split)
    const gciCol  = hdrs.findIndex((h) => h === "gci" || h.includes("grosscommission"));
    const netCol  = hdrs.findIndex((h) => h.includes("netcommission") || h.includes("netincome") || h === "net");
    // Require: name + at least one money column (sideCol is optional — not all trackers have it)
    if (nameCol !== -1 && (gciCol !== -1 || netCol !== -1)) {
      return {
        nameCol,
        addrCol:   hdrs.findIndex((h) => h === "address" || h.includes("property") || h.includes("addr")),
        dateCol:   hdrs.findIndex((h) => h.includes("date") || h.includes("close")),
        sideCol,   // may be -1; all deals get side:undefined if so
        sourceCol: hdrs.findIndex((h) => h === "source" || h.includes("leadsource") || h.includes("referral")),
        gciCol,
        netCol,
        rowIdx: i,
      };
    }
  }
  return null;
}

/** Parse a messy date cell from the agent tracker into YYYY-MM-DD.
 *  Returns `null` for blank or unparseable input — callers MUST surface this
 *  to the user rather than silently fabricating a mid-year date. Historically
 *  this function returned `${year}-06-15` as a fallback, which meant any row
 *  with a missing or malformed date was quietly backdated to June 15th and
 *  landed in Q2 of the quarter_gci breakdown. That corrupted seasonality
 *  calculations, deal-pace benchmarking, and any month-of-year analytics. */
function parseTrackerDate(raw: string, year: number): string | null {
  const s = raw?.trim() ?? "";
  if (!s) return null;

  // Q1 / Q2 / Q3 / Q4 — the cell explicitly claims a quarter, so using the
  // quarter-end as the date is accurate, not fabricated.
  const qm = s.match(/^Q([1-4])$/i);
  if (qm) {
    const ends = [{ m: 3, d: 31 }, { m: 6, d: 30 }, { m: 9, d: 30 }, { m: 12, d: 31 }];
    const q = ends[parseInt(qm[1]) - 1];
    return `${year}-${String(q.m).padStart(2, "0")}-${q.d}`;
  }

  // Strip parenthetical annotations: "Jan 12 (paid)" → "Jan 12"
  let cleaned = s.replace(/\s*\([^)]*\)/g, "").trim();

  // 2-digit year at end: "April 22, 25" or "Sept 28, 22" (comma required —
  // prevents bare day numbers like "June 12" from matching as "June, year 2012")
  cleaned = cleaned.replace(/,\s*\b(\d{2})\s*$/, (_, y2) => `, ${2000 + parseInt(y2)}`);

  // No 4-digit year → append sheet year: "May 1" → "May 1 2025"
  if (!/\b\d{4}\b/.test(cleaned)) cleaned = `${cleaned} ${year}`;

  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

/**
 * Parse a money cell from an agent tracker.
 * Handles common variants:
 *   - Currency symbols / prefixes: "$14,500", "CA$14,500", "USD 14500", "14500"
 *   - Accounting-style negatives: "(14,500)"  →  -14500
 *   - Leading minus:              "-14,500"    →  -14500
 *   - Whitespace, non-breaking spaces, and thousands separators.
 * Returns `NaN` for blank or unparseable input so callers can `if (!Number.isFinite(x))` skip it.
 */
function parseTrackerMoney(raw: string): number {
  if (!raw) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  // Accounting negative: "(1,234)" or "(1234.56)"
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1).trim();
  }
  // Drop currency prefixes (CA$, US$, USD, CAD, $, €, £) and thousands separators
  s = s.replace(/(?:^|\s)(ca\$|us\$|cad|usd)\s*/gi, "")
       .replace(/[$£€]/g, "")
       .replace(/[,\s\u00A0]/g, "");
  if (!s || s === "-" || s === ".") return NaN;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  return sign * n;
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

    // Parse money with accounting-negative + CA$ support. A deal with a
    // blank, negative, or unparseable GCI cell is a data-entry error on the
    // agent's side — skip it rather than silently coercing to $0 and landing
    // a phantom zero-dollar deal in the history.
    const gci = parseTrackerMoney(row[moneyCol] ?? "");
    if (!Number.isFinite(gci) || gci <= 0) continue;

    // Collect split ratios when both GCI and Net columns exist
    if (hdrs.gciCol >= 0 && hdrs.netCol >= 0) {
      const netVal = parseTrackerMoney(row[hdrs.netCol] ?? "");
      if (Number.isFinite(netVal) && netVal > 0 && netVal < gci) {
        splitRatios.push(netVal / gci);
      }
    }

    const rawSide = (hdrs.sideCol >= 0 ? row[hdrs.sideCol] ?? "" : "").toLowerCase();
    const side: import("@/app/api/import-history/route").ExtractedDeal["side"] =
      rawSide.includes("sell") && rawSide.includes("buy") ? "both"
      : rawSide.includes("sell") ? "seller"
      : rawSide.includes("buy") || rawSide.includes("rent") ? "buyer"
      : undefined;

    const source  = (hdrs.sourceCol >= 0 ? row[hdrs.sourceCol]?.trim() : "") || undefined;
    const address = (hdrs.addrCol   >= 0 ? row[hdrs.addrCol]?.trim()   : "") ?? "";
    const rawDate = (hdrs.dateCol   >= 0 ? row[hdrs.dateCol]?.trim()   : "") ?? "";

    // Skip rows with missing/unparseable dates. Fabricating a date silently
    // drops the deal into the wrong quarter and corrupts seasonality. The
    // UI surfaces skipped rows via deals.length < raw-row count so the user
    // can see how many rows were dropped and fix the source data.
    const parsedDate = parseTrackerDate(rawDate, sheetYear);
    if (!parsedDate) continue;

    deals.push({
      date:       parsedDate,
      address,
      sale_price: null,  // local tracker parsing — sale price not extracted from column
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

  // Derive annual totals from year-filtered quarterly accumulators (same fix as
  // server-side computeAggregates) — deals outside `year` are excluded.
  return {
    year,
    annual_gci: Math.round(quarter_gci.reduce((s, v) => s + v, 0) * 100) / 100,
    annual_tx:  quarter_tx.reduce((s, v) => s + v, 0),
    quarter_gci,
    quarter_tx,
    deals,
    split_pct: splitPct,
  };
}
