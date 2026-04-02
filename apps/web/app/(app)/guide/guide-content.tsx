"use client";

import { useState, useMemo, useRef, useEffect } from "react";
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
  MapPin,
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
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  "PAGES & FEATURES": LayoutDashboard,
  "KEY METRICS & TERMS": DollarSign,
  "TAX REFERENCE (2025 CRA)": Calculator,
  "CLIENT STATUS (FLIGHT METAPHOR)": Users,
  "PIPELINE STAGES": Layers,
  "ONBOARDING": Rocket,
  "EXPENSE CATEGORIES (T2125 MAPPING)": Receipt,
  "FREQUENTLY ASKED QUESTIONS": HelpCircle,
  "CREA MLS® STATISTICS — DATA METHODOLOGY": MapPin,
};

/**
 * Maps friendly anchor IDs (used by GuideLink components across the app)
 * to the knowledge base section IDs generated from ### headings.
 * e.g. GuideLink anchor="runway-score" → opens KEY METRICS & TERMS section
 */
const ANCHOR_MAP: Record<string, string> = {
  "runway-score":          "key-metrics-terms",
  "cash-runway":           "key-metrics-terms",
  "probability-bands":     "key-metrics-terms",
  "benchmark":             "key-metrics-terms",
  "expense-ratio":         "key-metrics-terms",
  "tax-estimate":          "tax-reference-2025-cra",
  "financial-waterfall":   "pages-features",
  "market-position":       "crea-mls-statistics-data-methodology",
};

function parseSections(kb: string): Section[] {
  // Split by ### headings
  const parts = kb.split(/^###\s+/m).filter(Boolean);
  const sections: Section[] = [];

  for (const part of parts) {
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) continue;

    const title = part.slice(0, newlineIdx).trim();
    const content = part.slice(newlineIdx + 1).trim();

    // Skip the top-level overview (## heading content before first ###)
    if (title.startsWith("##") || !content) continue;

    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    sections.push({
      id,
      title,
      content,
      icon: SECTION_ICONS[title] ?? BookOpen,
    });
  }

  return sections;
}

/* ── Simple markdown → JSX renderer ────────────────────────────── */

function renderContent(raw: string, searchQuery: string): React.ReactNode {
  const lines = raw.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    key++;
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<div key={key} className="h-2" />);
      continue;
    }

    // Sub-headings (#### or bold section titles like "DASHBOARD:")
    if (trimmed.match(/^[A-Z][A-Z &/()]+:/)) {
      elements.push(
        <h4 key={key} className="mt-4 mb-1.5 text-sm font-bold text-foreground/90 tracking-wide">
          {highlightText(trimmed, searchQuery)}
        </h4>,
      );
      continue;
    }

    // Q&A format
    if (trimmed.startsWith("Q:")) {
      elements.push(
        <p key={key} className="mt-3 text-sm font-semibold text-foreground/90">
          {highlightText(trimmed, searchQuery)}
        </p>,
      );
      continue;
    }
    if (trimmed.startsWith("A:")) {
      elements.push(
        <p key={key} className="text-sm text-muted-foreground leading-relaxed mb-2">
          {highlightText(trimmed, searchQuery)}
        </p>,
      );
      continue;
    }

    // Regular text
    elements.push(
      <p key={key} className="text-sm text-muted-foreground leading-relaxed">
        {highlightText(trimmed, searchQuery)}
      </p>,
    );
  }

  return <>{elements}</>;
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
  subscriptionTier: string;
  province: string;
  businessStructure: string;
  splitPreset: string;
}

export function GuideContent({
  subscriptionTier,
  province: _province,
  businessStructure: _businessStructure,
  splitPreset: _splitPreset,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [pdfLoading, setPdfLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { askQuestion } = useAiChat();
  const isPro = subscriptionTier === "professional" || subscriptionTier === "team";

  const sections = useMemo(() => parseSections(KNOWLEDGE_BASE), []);

  // Handle deep-link anchors: /guide#runway-score → expand + scroll to the right section
  useEffect(() => {
    const hash = window.location.hash.slice(1); // remove leading #
    if (!hash) return;
    // Map friendly anchor ID to section ID (fallback to raw hash)
    const targetId = ANCHOR_MAP[hash] ?? hash;
    // Expand the target section
    setExpandedSections((prev) => new Set([...prev, targetId]));
    // Delay scroll to allow DOM to render the expanded content
    const timer = setTimeout(() => {
      const el = document.getElementById(`guide-${targetId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return sections;
    const q = searchQuery.toLowerCase();
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q),
    );
  }, [sections, searchQuery]);

  // Auto-expand all sections when searching
  const effectiveExpanded = useMemo(() => {
    if (searchQuery.length >= 2) {
      return new Set(filteredSections.map((s) => s.id));
    }
    return expandedSections;
  }, [searchQuery, filteredSections, expandedSections]);

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedSections(new Set(sections.map((s) => s.id)));
  }

  function collapseAll() {
    setExpandedSections(new Set());
  }

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Platform Guide
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you need to know about Agent Runway — searchable and always up to date.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {pdfLoading ? "Generating…" : "Download PDF"}
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search features, metrics, terms, tax rules…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Search results count */}
      {searchQuery.length >= 2 && (
        <p className="text-sm text-muted-foreground">
          {filteredSections.length === 0
            ? "No sections match your search."
            : `${filteredSections.length} section${filteredSections.length !== 1 ? "s" : ""} found`}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        {/* Table of contents sidebar — desktop only */}
        <nav className="hidden lg:block">
          <div className="sticky top-4 space-y-1">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Sections
              </p>
              <div className="flex gap-1">
                <button
                  onClick={expandAll}
                  className="text-[10px] text-primary/60 hover:text-primary transition-colors"
                >
                  Expand
                </button>
                <span className="text-[10px] text-muted-foreground/30">|</span>
                <button
                  onClick={collapseAll}
                  className="text-[10px] text-primary/60 hover:text-primary transition-colors"
                >
                  Collapse
                </button>
              </div>
            </div>
            {sections.map((section) => {
              const isFiltered = searchQuery.length >= 2 && !filteredSections.includes(section);
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                    isFiltered
                      ? "text-muted-foreground/30 cursor-default"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                  disabled={isFiltered}
                >
                  <section.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{section.title}</span>
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
              <Card key={section.id} id={`guide-${section.id}`} className="overflow-hidden">
                {/* Section header — always visible, clickable */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <section.icon className="h-4 w-4" />
                  </div>
                  <h3 className="flex-1 text-sm font-semibold text-foreground">
                    {highlightText(section.title, searchQuery)}
                  </h3>
                  <div className="flex items-center gap-2">
                    {isPro && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-2 py-0.5 cursor-pointer hover:bg-primary/10 border-primary/30 text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          askQuestion(`Tell me about ${section.title} on Agent Runway`);
                        }}
                      >
                        <Sparkles className="h-2.5 w-2.5 mr-1" />
                        Ask AI
                      </Badge>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                    )}
                  </div>
                </button>

                {/* Section content — collapsible */}
                {isExpanded && (
                  <CardContent className="px-5 pb-5 pt-0 border-t border-border/50">
                    <div className="mt-3">
                      {renderContent(section.content, searchQuery)}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Empty state */}
          {filteredSections.length === 0 && searchQuery.length >= 2 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                No results for &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Try a different search term, or{" "}
                {isPro ? (
                  <button
                    onClick={() => askQuestion(searchQuery)}
                    className="text-primary underline underline-offset-2"
                  >
                    ask your AI assistant
                  </button>
                ) : (
                  "check the FAQ section"
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
