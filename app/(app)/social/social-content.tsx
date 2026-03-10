"use client";

/**
 * Social Media Studio — Agent Runway
 *
 * Lets agents select a month's closed deals, pick a carousel template,
 * preview all slides, auto-generate a caption, and download a ZIP of
 * 1080×1080 PNG slides ready for Instagram / Facebook.
 *
 * Phase 1: Template builder + download.
 * Phase 2 (post Meta App Review): direct posting via Meta Graph API.
 */

import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Copy,
  Check,
  Sparkles,
  Facebook,
  Link2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { fmtCurrency } from "@/lib/formatters";
import {
  computeGCI,
  type Transaction,
  type UserSettings,
} from "@/lib/types/database";
import JSZip from "jszip";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Connection {
  platform: string;
  account_name: string | null;
  token_expires_at: string | null;
}

interface Props {
  settings: UserSettings | null;
  transactions: Transaction[];
  connections: Connection[];
}

type TemplateStyle = "classic" | "bold" | "minimal";

interface SlideSpec {
  type: "cover" | "property" | "closer";
  label: string;
  tx?: Transaction;
  slideNum?: number;
  slideTotal?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STYLE_META: Record<TemplateStyle, { label: string; desc: string; preview: string }> = {
  classic: {
    label:   "Classic",
    desc:    "White background, navy & blue",
    preview: "bg-white border-blue-200",
  },
  bold: {
    label:   "Bold",
    desc:    "Dark navy with gold accents",
    preview: "bg-slate-900 border-amber-400",
  },
  minimal: {
    label:   "Minimal",
    desc:    "Light grey, clean & modern",
    preview: "bg-slate-50 border-slate-300",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSlideUrl(
  spec: SlideSpec,
  style: TemplateStyle,
  agentName: string,
  brokerage: string,
  month: string,
  year: number,
  totalCount: number,
  totalGci: string,
): string {
  const base = "/api/social/slide";
  const common = new URLSearchParams({
    style,
    agentName,
    brokerage,
    month,
    year: String(year),
    slideNum:   String(spec.slideNum ?? 1),
    slideTotal: String(spec.slideTotal ?? 1),
  });

  if (spec.type === "cover") {
    common.set("type", "cover");
    common.set("count", String(totalCount));
    common.set("totalGci", totalGci);
    return `${base}?${common.toString()}`;
  }

  if (spec.type === "property" && spec.tx) {
    const tx = spec.tx;
    const gci = computeGCI(tx);
    common.set("type", "property");
    common.set("address", tx.address ?? "");
    common.set("role", tx.side);
    common.set("gci", fmtCurrency(gci));
    common.set("price", fmtCurrency(tx.sale_price));
    return `${base}?${common.toString()}`;
  }

  // closer
  common.set("type", "closer");
  return `${base}?${common.toString()}`;
}

function generateCaption(
  agentName: string,
  brokerage: string,
  month: string,
  year: number,
  txList: Transaction[],
): string {
  const count = txList.length;
  const totalGci = txList.reduce((s, tx) => s + computeGCI(tx), 0);
  const plural = count === 1 ? "deal" : "deals";

  const lines: string[] = [
    `🏡 ${count} ${plural} closed in ${month} ${year}!`,
    "",
  ];

  if (count <= 5) {
    txList.forEach((tx) => {
      const side = tx.side === "buyer" ? "👤 Buyer" : tx.side === "seller" ? "🤝 Seller" : "⭐ Both";
      lines.push(`${side} · ${tx.address || "Property"}`);
    });
    lines.push("");
  }

  if (totalGci > 0) {
    lines.push(`Total GCI: ${fmtCurrency(totalGci)} 🎯`);
    lines.push("");
  }

  lines.push(
    "Whether you're buying, selling, or just exploring your options — I'm here to guide you every step of the way.",
    "",
    "📲 DM me to get started!",
    "",
    "#JustClosed #RealEstate #HomeOwnership #CanadianRealEstate #RealtorLife",
  );

  if (brokerage) lines.push(`#${brokerage.replace(/\s+/g, "")}`);

  return lines.join("\n");
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SocialContent({ settings, transactions, connections }: Props) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [templateStyle, setTemplateStyle] = useState<TemplateStyle>("classic");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState<string>("");
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [slideLoadErrors, setSlideLoadErrors] = useState<Set<number>>(new Set());

  // ── Derived values (computed before hooks — safe with null settings) ────────
  const agentName  = settings?.display_name  ?? "Your Agent";
  const brokerage  = settings?.business_name || settings?.brokerage_name || "";
  const monthLabel = MONTH_NAMES[selectedMonth];

  // ── Filter transactions for selected month ─────────────────────────────────
  const monthTx = transactions.filter((tx) => {
    const d = new Date(tx.date);
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });

  const selectedTx = monthTx.filter((tx) => selectedIds.has(tx.id));
  const totalGci   = selectedTx.reduce((s, tx) => s + computeGCI(tx), 0);

  // ── Build slide list ───────────────────────────────────────────────────────
  const slides: SlideSpec[] = [
    { type: "cover", label: "Cover", slideNum: 1, slideTotal: selectedTx.length + 2 },
    ...selectedTx.map((tx, idx) => ({
      type: "property" as const,
      label: tx.address || `Deal ${idx + 1}`,
      tx,
      slideNum: idx + 2,
      slideTotal: selectedTx.length + 2,
    })),
    { type: "closer", label: "Call to Action", slideNum: selectedTx.length + 2, slideTotal: selectedTx.length + 2 },
  ];

  const safeSlide = Math.min(currentSlide, slides.length - 1);
  const currentSlideSpec = slides[safeSlide];

  // ── Auto-select all transactions in the month on month change ──────────────
  useEffect(() => {
    const newIds = new Set(monthTx.map((tx) => tx.id));
    setSelectedIds(newIds);
    setCurrentSlide(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear]);

  // ── Auto-generate caption when selection changes ───────────────────────────
  useEffect(() => {
    if (selectedTx.length > 0) {
      setCaption(generateCaption(agentName, brokerage, monthLabel, selectedYear, selectedTx));
    } else {
      setCaption("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectedMonth, selectedYear]);

  // ── Slide URL builder ──────────────────────────────────────────────────────
  const slideUrl = useCallback(
    (spec: SlideSpec) =>
      buildSlideUrl(
        spec,
        templateStyle,
        agentName,
        brokerage,
        monthLabel,
        selectedYear,
        selectedTx.length,
        totalGci > 0 ? fmtCurrency(totalGci) : "",
      ),
    [templateStyle, agentName, brokerage, monthLabel, selectedYear, selectedTx.length, totalGci],
  );

  // ── Early return AFTER all hooks ───────────────────────────────────────────
  if (!settings) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Settings not found.
      </div>
    );
  }

  // ── Toggle selection ───────────────────────────────────────────────────────
  function toggleTx(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setCurrentSlide(0);
  }

  // ── Copy caption ───────────────────────────────────────────────────────────
  async function handleCopy() {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Regenerate caption ─────────────────────────────────────────────────────
  function handleRegenerateCaption() {
    setCaption(generateCaption(agentName, brokerage, monthLabel, selectedYear, selectedTx));
  }

  // ── Download all slides as ZIP ────────────────────────────────────────────
  async function handleDownload() {
    if (slides.length === 0 || selectedTx.length === 0) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(`${monthLabel}-${selectedYear}-closings`);

      for (let i = 0; i < slides.length; i++) {
        const spec = slides[i];
        const url = slideUrl(spec);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Slide ${i + 1} failed: ${response.status}`);
        const blob = await response.blob();
        const fileName = `slide-${String(i + 1).padStart(2, "0")}-${spec.type}.png`;
        folder?.file(fileName, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const objUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `agent-runway-${monthLabel.toLowerCase()}-${selectedYear}-carousel.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  }

  // ── Available years (current year ± 2) ────────────────────────────────────
  const currentYear = now.getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  // ── Connected accounts ─────────────────────────────────────────────────────
  const igConn = connections.find((c) => c.platform === "instagram");
  const fbConn = connections.find((c) => c.platform === "facebook");

  const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID; // optional public var
  const siteUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentrunway.ca";
  const igAuthUrl = metaAppId
    ? `https://www.instagram.com/oauth/authorize?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(`${siteUrl}/api/auth/meta/callback`)}&scope=instagram_business_basic,instagram_business_content_publish&response_type=code`
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="border-b border-border/60 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              Social Media Studio
              <Badge variant="outline" className="border-pink-300 bg-pink-50 text-pink-700 text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                Beta
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Build branded carousel posts from your closed deals — ready for Instagram &amp; Facebook
            </p>
          </div>
          {/* Connected account badges */}
          <div className="flex items-center gap-2">
            {igConn ? (
              <Badge variant="outline" className="border-pink-300 bg-pink-50 text-pink-700">
                <Instagram className="h-3 w-3 mr-1" /> @{igConn.account_name ?? "Connected"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground border-dashed">
                <Instagram className="h-3 w-3 mr-1" /> Not connected
              </Badge>
            )}
            {fbConn ? (
              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
                <Facebook className="h-3 w-3 mr-1" /> {fbConn.account_name ?? "Connected"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground border-dashed">
                <Facebook className="h-3 w-3 mr-1" /> Not connected
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">

        {/* ── Left Panel — Controls ────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Month selector */}
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Select Month</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-lg border border-slate-200 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
                <select
                  className="w-[90px] rounded-lg border border-slate-200 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                {monthTx.length} closed deal{monthTx.length !== 1 ? "s" : ""} in {monthLabel} {selectedYear}
              </p>
            </CardContent>
          </Card>

          {/* Template style */}
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Template Style</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(Object.entries(STYLE_META) as [TemplateStyle, typeof STYLE_META[TemplateStyle]][]).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setTemplateStyle(key)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                    templateStyle === key
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-lg border-2 shrink-0 ${meta.preview}`} />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{meta.label}</div>
                    <div className="text-xs text-slate-500">{meta.desc}</div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Transaction picker */}
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Select Deals</CardTitle>
                {monthTx.length > 0 && (
                  <button
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => {
                      if (selectedIds.size === monthTx.length) {
                        setSelectedIds(new Set());
                      } else {
                        setSelectedIds(new Set(monthTx.map((t) => t.id)));
                      }
                      setCurrentSlide(0);
                    }}
                  >
                    {selectedIds.size === monthTx.length ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {monthTx.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No closed deals in {monthLabel} {selectedYear}.
                  <br />Try a different month.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {monthTx.map((tx) => {
                    const gci = computeGCI(tx);
                    const isSelected = selectedIds.has(tx.id);
                    return (
                      <button
                        key={tx.id}
                        onClick={() => toggleTx(tx.id)}
                        className={`w-full flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs transition-all ${
                          isSelected
                            ? "border-blue-400 bg-blue-50"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div
                          className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                            isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300"
                          }`}
                        >
                          {isSelected && (
                            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {tx.address || "Address TBD"}
                          </div>
                          <div className="text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <span className="capitalize">{tx.side}</span>
                            <span>·</span>
                            <span className="font-medium text-emerald-700">{fmtCurrency(gci)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connect accounts (coming soon) */}
          <Card className="rounded-2xl border-dashed border-slate-200 bg-slate-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Connect Accounts
              </CardTitle>
              <CardDescription className="text-xs">
                Post directly from Agent Runway once Meta reviews your app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {igAuthUrl ? (
                <a
                  href={igAuthUrl}
                  className="flex items-center gap-2 w-full rounded-lg border border-pink-200 bg-white px-3 py-2 text-xs font-medium text-pink-700 hover:bg-pink-50 transition-colors"
                >
                  <Instagram className="h-3.5 w-3.5" />
                  {igConn ? `Connected: @${igConn.account_name}` : "Connect Instagram"}
                </a>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 mb-1">
                    <Instagram className="h-3.5 w-3.5" />
                    <span className="font-medium">Instagram (pending Meta review)</span>
                  </div>
                  <span>Add NEXT_PUBLIC_META_APP_ID to enable.</span>
                </div>
              )}
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <Facebook className="h-3.5 w-3.5" />
                <span>Facebook (pending Meta review)</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right Panel — Preview + Actions ──────────────────────────────── */}
        <div className="space-y-5">

          {/* Carousel preview */}
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Carousel Preview</CardTitle>
                  <CardDescription className="text-xs">
                    {slides.length} slides · 1080×1080 · Swipe-ready
                  </CardDescription>
                </div>
                {selectedTx.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Slide {safeSlide + 1} of {slides.length}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {selectedTx.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 border border-dashed border-slate-200 aspect-square max-w-[400px] mx-auto gap-3 text-center p-8">
                  <div className="text-4xl">📱</div>
                  <p className="text-sm font-medium text-slate-600">No deals selected</p>
                  <p className="text-xs text-muted-foreground">
                    Select at least one deal from the left panel to preview your carousel.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  {/* Main slide preview */}
                  <div className="relative w-full max-w-[440px] mx-auto">
                    <div className="aspect-square w-full rounded-xl overflow-hidden border border-slate-200 shadow-md bg-slate-100">
                      {currentSlideSpec && (
                        <img
                          key={slideUrl(currentSlideSpec)}
                          src={slideUrl(currentSlideSpec)}
                          alt={currentSlideSpec.label}
                          className="w-full h-full object-cover"
                          onError={() => {
                            setSlideLoadErrors((prev) => new Set([...prev, safeSlide]));
                          }}
                        />
                      )}
                      {slideLoadErrors.has(safeSlide) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-xs text-muted-foreground">
                          Slide preview unavailable
                        </div>
                      )}
                    </div>

                    {/* Nav arrows */}
                    {slides.length > 1 && (
                      <>
                        <button
                          onClick={() => setCurrentSlide(Math.max(0, safeSlide - 1))}
                          disabled={safeSlide === 0}
                          className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 shadow border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setCurrentSlide(Math.min(slides.length - 1, safeSlide + 1))}
                          disabled={safeSlide === slides.length - 1}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 shadow border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Slide dot nav */}
                  <div className="flex gap-1.5 items-center">
                    {slides.map((spec, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSlide(idx)}
                        title={spec.label}
                        className={`transition-all rounded-full ${
                          idx === safeSlide
                            ? "w-5 h-2 bg-blue-600"
                            : "w-2 h-2 bg-slate-300 hover:bg-slate-400"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Slide thumbnail strip */}
                  <div className="w-full overflow-x-auto">
                    <div className="flex gap-2 pb-2" style={{ minWidth: "max-content" }}>
                      {slides.map((spec, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentSlide(idx)}
                          className={`shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                            idx === safeSlide
                              ? "border-blue-500 shadow-md"
                              : "border-transparent hover:border-slate-300"
                          }`}
                          style={{ width: 64, height: 64 }}
                        >
                          <img
                            src={slideUrl(spec)}
                            alt={spec.label}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Caption generator */}
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Caption
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Auto-generated — edit freely before copying
                  </CardDescription>
                </div>
                <button
                  onClick={handleRegenerateCaption}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-slate-700 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={9}
                className="resize-none text-sm font-mono leading-relaxed"
                placeholder="Select deals above to auto-generate a caption…"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!caption}
                  className="gap-1.5"
                >
                  {copied ? (
                    <><Check className="h-3.5 w-3.5 text-emerald-600" /> Copied!</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copy Caption</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Download */}
          <Card className="rounded-2xl border-blue-200 bg-blue-50/40 shadow-sm">
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900 mb-1">
                    Download Carousel Slides
                  </div>
                  <div className="text-sm text-slate-600">
                    {selectedTx.length === 0
                      ? "Select deals to generate slides"
                      : `${slides.length} slides ready · ZIP archive · 1080×1080 PNG`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Upload directly to Instagram, Facebook, or your scheduler
                  </div>
                </div>
                <Button
                  size="lg"
                  onClick={handleDownload}
                  disabled={selectedTx.length === 0 || downloading}
                  className="shrink-0 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {downloading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                  ) : (
                    <><Download className="h-4 w-4" /> Download ZIP</>
                  )}
                </Button>
              </div>

              {/* Platform note */}
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
                    <Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram
                  </div>
                  Upload slides in order. Add caption + hashtags in the IG app.
                  Use Carousel format (up to 10 slides).
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
                    <Facebook className="h-3.5 w-3.5 text-blue-500" /> Facebook
                  </div>
                  Create a post, add multiple photos, or use Business Suite
                  to schedule for the best engagement time.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-5 py-4 text-xs text-muted-foreground space-y-2">
            <p className="font-semibold text-slate-700">📸 Tips for best results</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Post on Tuesday–Thursday, 9–11am or 6–8pm for highest reach</li>
              <li>Add property photos: upload after downloading, replace the placeholder slides</li>
              <li>Tag your brokerage and city accounts for amplification</li>
              <li>Reply to comments within the first hour — it signals the algorithm</li>
              <li>Reuse the caption across platforms (edit hashtags for LinkedIn)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
