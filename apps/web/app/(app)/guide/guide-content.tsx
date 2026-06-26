"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Search,
  Download,
  Sparkles,
  ChevronDown,
  ChevronRight,
  BookOpen,
  LayoutDashboard,
  Receipt,
  Users,
  HelpCircle,
  DollarSign,
  Calculator,
  Layers,
  Rocket,
  Gauge,
  BarChart3,
  Send,
  Plane,
  TrendingUp,
  Target,
  FileText,
  Lightbulb,
  X,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { useAiChat } from "@/lib/ai-chat-context";
import type { LucideIcon } from "lucide-react";

/* ── Parse knowledge base into sections ────────────────────────── */

interface Section {
  id: string;
  title: string;
  content: string;
  icon: LucideIcon;
  description: string;
  color: string; // tailwind gradient classes
}

const SECTION_META: Record<string, { icon: LucideIcon; description: string; color: string }> = {
  "PAGES & FEATURES": {
    icon: LayoutDashboard,
    description: "Every page in Agent Runway — what it does and how to use it",
    color: "from-blue-500/15 to-blue-600/5 border-blue-500/20",
  },
  "FLIGHT CONTROL — AI OUTREACH AUTOMATION SYSTEM": {
    icon: Send,
    description: "Automated AI-powered client outreach — drafts, tones, and smart suppression",
    color: "from-violet-500/15 to-violet-600/5 border-violet-500/20",
  },
  "KEY METRICS & COMPUTATIONS": {
    icon: Gauge,
    description: "How every metric is calculated — Runway Score, pace, projections, and more",
    color: "from-emerald-500/15 to-emerald-600/5 border-emerald-500/20",
  },
  "CLIENT STATUS — FLIGHT METAPHOR": {
    icon: Plane,
    description: "The 6 client lifecycle stages from Boarding to Cruising",
    color: "from-sky-500/15 to-sky-600/5 border-sky-500/20",
  },
  "PIPELINE STAGES & PROBABILITIES": {
    icon: Layers,
    description: "Deal stages, probability weights, and weighted GCI calculations",
    color: "from-amber-500/15 to-amber-600/5 border-amber-500/20",
  },
  "TAX REFERENCE — 2025 CRA RATES": {
    icon: Calculator,
    description: "Federal brackets, CPP, provincial rates, GST/HST, home office, mileage",
    color: "from-red-500/15 to-red-600/5 border-red-500/20",
  },
  "EXPENSE CATEGORIES — CRA T2125 MAPPING": {
    icon: Receipt,
    description: "CRA expense categories, T2125 line codes, and deduction rules",
    color: "from-orange-500/15 to-orange-600/5 border-orange-500/20",
  },
  "COMMISSION STRUCTURE": {
    icon: DollarSign,
    description: "Splits, desk fees, per-deal fees, annual cap logic",
    color: "from-green-500/15 to-green-600/5 border-green-500/20",
  },
  "ONBOARDING WIZARD": {
    icon: Rocket,
    description: "The 8-step setup wizard — province, structure, fees, and goals",
    color: "from-fuchsia-500/15 to-fuchsia-600/5 border-fuchsia-500/20",
  },
  "INSIGHT & ADVISOR ENGINE THRESHOLDS": {
    icon: Lightbulb,
    description: "How AI insights and advisor cards are triggered based on your data",
    color: "from-yellow-500/15 to-yellow-600/5 border-yellow-500/20",
  },
  "AI ASSISTANT BEHAVIORAL GUIDELINES": {
    icon: MessageSquare,
    description: "How the Flight Crew communicates — style, tone, and proactive triggers",
    color: "from-indigo-500/15 to-indigo-600/5 border-indigo-500/20",
  },
  "PROACTIVE INSIGHT TRIGGERS": {
    icon: TrendingUp,
    description: "Automatic alerts for pace, expenses, pipeline, and survival thresholds",
    color: "from-rose-500/15 to-rose-600/5 border-rose-500/20",
  },
  "FREQUENTLY ASKED QUESTIONS": {
    icon: HelpCircle,
    description: "Quick answers to the most common questions about Agent Runway",
    color: "from-slate-500/15 to-slate-600/5 border-slate-500/20",
  },
};

const DEFAULT_META = {
  icon: BookOpen,
  description: "",
  color: "from-gray-500/15 to-gray-600/5 border-gray-500/20",
};

/**
 * Maps friendly anchor IDs (used by GuideLink components across the app)
 * to the knowledge base section IDs generated from ### headings.
 */
const ANCHOR_MAP: Record<string, string> = {
  "runway-score":          "key-metrics-computations",
  "cash-runway":           "key-metrics-computations",
  "probability-bands":     "key-metrics-computations",
  "benchmark":             "key-metrics-computations",
  "expense-ratio":         "key-metrics-computations",
  "tax-estimate":          "tax-reference-2025-cra-rates",
  "financial-waterfall":   "pages-features",
  "flight-control":        "flight-control-ai-outreach-automation-system",
  "flight-status":         "client-status-flight-metaphor",
  "pipeline":              "pipeline-stages-probabilities",
};

/* ── Quick reference cards shown at top ────────────────────────── */

interface QuickRef {
  title: string;
  value: string;
  sublabel: string;
  icon: LucideIcon;
  anchor: string;
}

const QUICK_REFS: QuickRef[] = [
  {
    title: "Runway Score",
    value: "0–100",
    sublabel: "Pace 35% · Pipeline 30% · Expense 15% · Survival 15% · Benchmark 5%",
    icon: Gauge,
    anchor: "key-metrics-computations",
  },
  {
    title: "Flight Statuses",
    value: "4 stages",
    sublabel: "Boarding → Scheduled → In-Flight → Cruising",
    icon: Plane,
    anchor: "client-status-flight-metaphor",
  },
  {
    title: "Pipeline Stages",
    value: "5 stages",
    sublabel: "Lead 10% · Showing 20% · Offer 40% · Conditional 60% · Firm 90%",
    icon: Target,
    anchor: "pipeline-stages-probabilities",
  },
  {
    title: "Score Grades",
    value: "A+ to F",
    sublabel: "A+ (92+) · A (85) · B (75) · C (62) · D (50) · F (<50)",
    icon: BarChart3,
    anchor: "key-metrics-computations",
  },
];

/* ── Getting started cards ─────────────────────────────────────── */

interface GettingStartedItem {
  title: string;
  description: string;
  icon: LucideIcon;
  sectionAnchor: string;
}

const GETTING_STARTED: GettingStartedItem[] = [
  {
    title: "Set up your profile",
    description: "Province, commission split, brokerage fees, and annual goal",
    icon: Rocket,
    sectionAnchor: "onboarding-wizard",
  },
  {
    title: "Log your first deal",
    description: "Add closed transactions to start tracking GCI and projections",
    icon: FileText,
    sectionAnchor: "pages-features",
  },
  {
    title: "Add your clients",
    description: "Import or manually add clients to start using the CRM and AI outreach",
    icon: Users,
    sectionAnchor: "client-status-flight-metaphor",
  },
  {
    title: "Review Flight Control",
    description: "See how AI detects opportunities and drafts personalized outreach",
    icon: Send,
    sectionAnchor: "flight-control-ai-outreach-automation-system",
  },
];

/* ── Parse knowledge base ──────────────────────────────────────── */

function parseSections(kb: string): Section[] {
  const parts = kb.split(/^###\s+/m).filter(Boolean);
  const sections: Section[] = [];

  for (const part of parts) {
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) continue;

    const title = part.slice(0, newlineIdx).trim();
    const content = part.slice(newlineIdx + 1).trim();

    if (title.startsWith("##") || !content) continue;

    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const meta = SECTION_META[title] ?? DEFAULT_META;

    sections.push({
      id,
      title,
      content,
      icon: meta.icon,
      description: meta.description,
      color: meta.color,
    });
  }

  return sections;
}

/* ── Improved markdown renderer ───────────────────────────────── */

function renderContent(raw: string, searchQuery: string): React.ReactNode {
  const lines = raw.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;
  let inTable = false;
  let tableRows: string[][] = [];
  let tableHeaders: string[] = [];

  function flushTable() {
    if (tableHeaders.length === 0 && tableRows.length === 0) return;
    elements.push(
      <div key={++key} className="my-4 overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-sm">
          {tableHeaders.length > 0 && (
            <thead>
              <tr className="bg-muted/50 border-b border-border/50">
                {tableHeaders.map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left font-semibold text-foreground/80 text-xs uppercase tracking-wide">
                    {highlightText(h.trim(), searchQuery)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri} className={cn("border-b border-border/30 last:border-0", ri % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2.5 text-sm text-muted-foreground">
                    {highlightText(cell.trim(), searchQuery)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableHeaders = [];
    tableRows = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    key++;
    const line = lines[i];
    const trimmed = line.trim();

    // Table detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.split("|").filter(Boolean);
      // Separator row (|---|---|)
      if (cells.every((c) => /^[\s-:]+$/.test(c))) {
        inTable = true;
        continue;
      }
      if (!inTable && tableHeaders.length === 0) {
        tableHeaders = cells;
        continue;
      }
      if (inTable) {
        tableRows.push(cells);
        continue;
      }
    } else if (inTable) {
      flushTable();
    }

    if (!trimmed) {
      elements.push(<div key={key} className="h-3" />);
      continue;
    }

    // Bold section titles (ALL CAPS with colon)
    if (trimmed.match(/^\*\*[A-Z].*\*\*$/)) {
      const inner = trimmed.replace(/^\*\*|\*\*$/g, "");
      elements.push(
        <h4 key={key} className="mt-5 mb-2 text-sm font-bold text-foreground tracking-wide flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          {highlightText(inner, searchQuery)}
        </h4>,
      );
      continue;
    }

    // Sub-headings (#### or bold section titles like "DASHBOARD:")
    if (trimmed.match(/^[A-Z][A-Z &/()®]+:/)) {
      elements.push(
        <h4 key={key} className="mt-5 mb-2 text-sm font-bold text-foreground tracking-wide flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          {highlightText(trimmed, searchQuery)}
        </h4>,
      );
      continue;
    }

    // **Bold text** inline
    if (trimmed.startsWith("**") && trimmed.includes(":**")) {
      const parts = trimmed.split(":**");
      const label = parts[0].replace(/^\*\*/, "");
      const rest = parts.slice(1).join(":**").replace(/\*\*$/, "");
      elements.push(
        <p key={key} className="text-sm text-muted-foreground leading-relaxed mt-1">
          <span className="font-semibold text-foreground/90">{highlightText(label, searchQuery)}:</span>
          {highlightText(rest, searchQuery)}
        </p>,
      );
      continue;
    }

    // Q&A format
    if (trimmed.startsWith("Q:") || trimmed.startsWith("**Q:")) {
      const q = trimmed.replace(/^\*\*Q:\s*/, "Q: ").replace(/\*\*$/, "");
      elements.push(
        <div key={key} className="mt-4 mb-1 flex items-start gap-2">
          <div className="mt-1 h-5 w-5 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
            <HelpCircle className="h-3 w-3 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground/90">
            {highlightText(q, searchQuery)}
          </p>
        </div>,
      );
      continue;
    }
    if (trimmed.startsWith("A:") || trimmed.startsWith("**A:")) {
      const a = trimmed.replace(/^\*\*A:\s*/, "A: ").replace(/\*\*$/, "");
      elements.push(
        <p key={key} className="text-sm text-muted-foreground leading-relaxed mb-3 pl-7">
          {highlightText(a, searchQuery)}
        </p>,
      );
      continue;
    }

    // Bullet points
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      const bullet = trimmed.replace(/^[-•]\s+/, "");
      elements.push(
        <div key={key} className="flex items-start gap-2.5 ml-1 my-0.5">
          <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            {renderInlineBold(highlightText(bullet, searchQuery))}
          </p>
        </div>,
      );
      continue;
    }

    // Italic note lines
    if (trimmed.startsWith("*") && trimmed.endsWith("*") && !trimmed.startsWith("**")) {
      elements.push(
        <p key={key} className="text-xs text-muted-foreground/60 italic mt-2 mb-1">
          {highlightText(trimmed.replace(/^\*|\*$/g, ""), searchQuery)}
        </p>,
      );
      continue;
    }

    // Regular text
    elements.push(
      <p key={key} className="text-sm text-muted-foreground leading-relaxed">
        {renderInlineBold(highlightText(trimmed, searchQuery))}
      </p>,
    );
  }

  // Flush any remaining table
  if (inTable || tableHeaders.length > 0) flushTable();

  return <>{elements}</>;
}

/** Render **bold** inline within already-processed text */
function renderInlineBold(node: React.ReactNode): React.ReactNode {
  if (typeof node !== "string") return node;
  const parts = node.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return node;
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <span key={i} className="font-semibold text-foreground/90">
            {part.slice(2, -2)}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;

  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  const parts = text.split(regex);

  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-primary/20 text-primary px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ── Guide page component ──────────────────────────────────────── */

interface Props {
  isPro: boolean;
  province: string;
  businessStructure: string;
  splitPreset: string;
}

export function GuideContent({
  isPro,
  province: _province,
  businessStructure: _businessStructure,
  splitPreset: _splitPreset,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [pdfLoading, setPdfLoading] = useState(false);
  const [activeNav, setActiveNav] = useState<string | null>(null);
  const [showGettingStarted, setShowGettingStarted] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const { askQuestion } = useAiChat();

  const sections = useMemo(() => parseSections(KNOWLEDGE_BASE), []);

  // Handle deep-link anchors
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const targetId = ANCHOR_MAP[hash] ?? hash;
    setExpandedSections((prev) => new Set([...prev, targetId]));
    setShowGettingStarted(false);
    const timer = setTimeout(() => {
      const el = document.getElementById(`guide-${targetId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Track active section for sidebar highlight
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id.replace("guide-", "");
            setActiveNav(id);
          }
        }
      },
      { threshold: 0.2, rootMargin: "-80px 0px -60% 0px" },
    );

    sections.forEach((s) => {
      const el = document.getElementById(`guide-${s.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return sections;
    const q = searchQuery.toLowerCase();
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }, [sections, searchQuery]);

  // Auto-expand all sections when searching
  const effectiveExpanded = useMemo(() => {
    if (searchQuery.length >= 2) {
      return new Set(filteredSections.map((s) => s.id));
    }
    return expandedSections;
  }, [searchQuery, filteredSections, expandedSections]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function scrollToSection(id: string) {
    const el = document.getElementById(`guide-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setExpandedSections((prev) => new Set([...prev, id]));
    }
  }

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { GuidePdf } = await import("@/components/pdf/guide-pdf");
      const blob = await pdf(
        <GuidePdf
          province={_province}
          businessStructure={_businessStructure}
          splitPreset={_splitPreset}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "agent-runway-guide.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfLoading(false);
    }
  }

  const isSearching = searchQuery.length >= 2;

  return (
    <div className="space-y-6 pb-12">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            Platform Guide
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-lg">
            Your complete reference to every feature, metric, and concept on Agent Runway.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isPro && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => askQuestion("Give me a quick overview of how to use Agent Runway effectively")}
              className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Ask AI
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {pdfLoading ? "Generating…" : "PDF"}
          </Button>
        </div>
      </div>

      {/* ── Search ──────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search features, metrics, tax rules, terms…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center h-5 w-5 rounded-full bg-muted hover:bg-muted-foreground/20 transition-colors"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* ── Search results count ────────────────────────────────── */}
      {isSearching && (
        <p className="text-sm text-muted-foreground">
          {filteredSections.length === 0
            ? "No sections match your search."
            : `${filteredSections.length} section${filteredSections.length !== 1 ? "s" : ""} found`}
        </p>
      )}

      {/* ── Getting Started (hidden during search) ──────────────── */}
      {!isSearching && showGettingStarted && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" />
              Getting Started
            </h2>
            <button
              onClick={() => setShowGettingStarted(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Hide
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {GETTING_STARTED.map((item) => (
              <button
                key={item.title}
                onClick={() => scrollToSection(item.sectionAnchor)}
                className="group text-left rounded-xl border border-border/60 bg-gradient-to-br from-muted/40 to-background p-4 hover:border-primary/30 hover:shadow-sm transition-all"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3 group-hover:bg-primary/15 transition-colors">
                  <item.icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">{item.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Reference Cards (hidden during search) ────────── */}
      {!isSearching && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_REFS.map((ref) => (
            <button
              key={ref.title}
              onClick={() => scrollToSection(ref.anchor)}
              className="group text-left rounded-xl border border-border/50 p-3.5 hover:border-primary/30 hover:shadow-sm transition-all bg-background"
            >
              <div className="flex items-center gap-2 mb-2">
                <ref.icon className="h-4 w-4 text-primary/70" />
                <span className="text-xs font-medium text-foreground">{ref.title}</span>
              </div>
              <p className="text-lg font-bold text-foreground mb-1">{ref.value}</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{ref.sublabel}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Main content grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[240px_1fr]">
        {/* Table of contents sidebar — desktop only */}
        <nav className="hidden xl:block">
          <div className="sticky top-4 space-y-0.5 max-h-[calc(100vh-120px)] overflow-y-auto pr-2 scrollbar-thin">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 px-2">
              Topics ({sections.length})
            </p>
            {sections.map((section) => {
              const isFiltered = isSearching && !filteredSections.includes(section);
              const isActive = activeNav === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left text-[11px] transition-all",
                    isFiltered
                      ? "text-muted-foreground/25 cursor-default"
                      : isActive
                        ? "text-primary bg-primary/8 font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                  disabled={isFiltered}
                >
                  <section.icon className={cn("h-3.5 w-3.5 shrink-0", isActive && "text-primary")} />
                  <span className="truncate leading-tight">{section.title}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content area */}
        <div ref={contentRef} className="space-y-3">
          {filteredSections.map((section) => {
            const isExpanded = effectiveExpanded.has(section.id);

            return (
              <div
                key={section.id}
                id={`guide-${section.id}`}
                className="scroll-mt-20"
              >
                <Card className={cn("overflow-hidden border transition-all", isExpanded && "shadow-sm")}>
                  {/* Section header */}
                  <button
                    onClick={() => toggleSection(section.id)}
                    className={cn(
                      "flex w-full items-center gap-4 px-5 py-4 text-left transition-colors",
                      isExpanded
                        ? `bg-gradient-to-r ${section.color}`
                        : "hover:bg-muted/30",
                    )}
                  >
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                      isExpanded ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}>
                      <section.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">
                        {highlightText(section.title, searchQuery)}
                      </h3>
                      {!isExpanded && section.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {section.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isPro && isExpanded && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-2 py-0.5 cursor-pointer hover:bg-primary/10 border-primary/30 text-primary hidden sm:flex"
                          onClick={(e) => {
                            e.stopPropagation();
                            askQuestion(`Tell me about ${section.title} on Agent Runway`);
                          }}
                        >
                          <Sparkles className="h-2.5 w-2.5 mr-1" />
                          Ask AI
                        </Badge>
                      )}
                      <div className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                        isExpanded ? "bg-primary/10" : "bg-transparent",
                      )}>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-primary" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Section content */}
                  {isExpanded && (
                    <CardContent className="px-5 pb-6 pt-0 border-t border-border/40">
                      <div className="mt-4 max-w-none">
                        {renderContent(section.content, searchQuery)}
                      </div>
                    </CardContent>
                  )}
                </Card>
              </div>
            );
          })}

          {/* Empty state */}
          {filteredSections.length === 0 && isSearching && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Search className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-foreground">
                No results for &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground max-w-xs">
                Try a different search term
                {isPro && (
                  <>
                    , or{" "}
                    <button
                      onClick={() => askQuestion(searchQuery)}
                      className="text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      ask your Flight Crew
                    </button>
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
