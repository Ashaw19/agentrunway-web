"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { fmtCurrency } from "@/lib/formatters";
import { computeEstimatedGCI } from "@/lib/types/database";
import { gstHstRate, gstHstLabel, marginalRate } from "@/lib/engines/canadian-tax-engine";
import { computeHSTCollected } from "@/lib/engines/hst-engine";
import { useConfetti } from "@/hooks/use-confetti";
import { CountUp } from "@/components/count-up";
import { toast } from "sonner";
import type { PipelineDeal, UserSettings } from "@/lib/types/database";
import {
  CalendarCheck, Clock, Moon, Home, User, TrendingUp,
  DollarSign, BadgePercent, StickyNote, PartyPopper,
  Landmark, Percent, Sparkles, PiggyBank, Copy, Check,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  dealsClosingToday: PipelineDeal[];
  settings?: UserSettings | null;
  ytdTransactions?: { sale_price: number; commission_pct: number; date: string }[];
}

type Mode = "main" | "confirm" | "delayed" | "celebrate";

// ── localStorage helpers ──────────────────────────────────────────────────────

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isDismissed(id: string) {
  try { return localStorage.getItem(`closing_prompt_dismissed_${localToday()}_${id}`) === "1"; } catch { return false; }
}
function markDismissed(id: string) {
  try { localStorage.setItem(`closing_prompt_dismissed_${localToday()}_${id}`, "1"); } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try { return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" }); }
  catch { return iso; }
}
function sideLabel(s: string) {
  return s === "buyer" ? "Buyer" : s === "seller" ? "Seller" : "Buyer & Seller";
}

const QUOTES = [
  "You didn't get into real estate to play it safe. Keep going.",
  "Every closed deal is proof that you outworked the doubt.",
  "This is what showing up every single day looks like.",
  "Champions adjust. Closers execute. You just did both.",
  "Signed, sealed, delivered. Now do it again.",
  "Real estate is a people business. You clearly people-well.",
  "You built this deal from a first call. Don't forget that.",
  "The best agents don't wait for the right market. They make the market right.",
];

const _MILESTONES = [25_000, 50_000, 100_000, 150_000, 200_000, 250_000, 300_000];

// ── Component ─────────────────────────────────────────────────────────────────

export function ClosingDayPrompt({ dealsClosingToday, settings, ytdTransactions = [] }: Props) {
  const router = useRouter();
  const { fire: fireConfetti } = useConfetti();

  const [open, setOpen]     = useState(false);
  const [queue, setQueue]   = useState<PipelineDeal[]>([]);
  const [mode, setMode]     = useState<Mode>("main");
  const [saving, setSaving] = useState(false);
  const savingRef           = useRef(false);
  const [copied, setCopied] = useState(false);
  const [quote]             = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  // Confirm-form state (pre-filled from pipeline deal)
  const [confirmForm, setConfirmForm] = useState({
    client_name: "", sale_price: "", commission_pct: "", side: "buyer" as "buyer" | "seller" | "both", date: localToday(),
  });

  // Delayed-form state
  const [newDate, setNewDate] = useState("");

  // Celebration data computed after close
  const [celebData, setCelebData] = useState<{
    gci: number; ytdGCIBefore: number; goalGCI: number; province: string;
    estimatedMarginalRate: number; dealsThisMonth: number; totalDealsThisYear: number;
    isGstHstRegistered: boolean; brokerageWithholdsHst: boolean;
  } | null>(null);

  useEffect(() => {
    const pending = dealsClosingToday.filter((d) => !isDismissed(d.id));
    if (pending.length === 0) return;
    setQueue(pending);
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [dealsClosingToday]);

  const current = queue[0] ?? null;

  // Pre-fill confirm form when current deal changes
  useEffect(() => {
    if (!current) return;
    setConfirmForm({
      client_name: current.client_name ?? "",
      sale_price: current.estimated_price ? String(current.estimated_price) : "",
      commission_pct: current.estimated_commission_pct ? String(current.estimated_commission_pct * 100) : "2.5",
      side: current.side ?? "buyer",
      date: localToday(),
    });
  }, [current]);

  function advance() {
    if (!current) return;
    markDismissed(current.id);
    const remaining = queue.slice(1);
    setMode("main");
    setNewDate("");
    setCelebData(null);
    if (remaining.length > 0) setQueue(remaining);
    else { setOpen(false); setQueue([]); }
  }

  async function handleRegisterClose() {
    if (!current || savingRef.current) return;
    if (!confirmForm.date) { toast.error("Please enter a close date."); return; }
    savingRef.current = true;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { savingRef.current = false; setSaving(false); return; }

    const salePrice = parseFloat(confirmForm.sale_price) || 0;
    const commPct   = (parseFloat(confirmForm.commission_pct) || 0) / 100;
    const gci       = salePrice * commPct;

    // INSERT transaction
    const { error: txErr } = await supabase.from("transactions").insert({
      user_id: user.id,
      address: current.address,
      client_name: confirmForm.client_name || "",
      sale_price: salePrice,
      commission_pct: commPct,
      side: confirmForm.side,
      status: "closed",
      date: confirmForm.date,
      source: "manual",
    });
    if (txErr) { toast.error("Failed to register close — please try again."); savingRef.current = false; setSaving(false); return; }

    // DELETE pipeline deal
    const { error: delErr } = await supabase.from("pipeline_deals").delete().eq("id", current.id).eq("user_id", user.id);
    if (delErr) console.error("[closing-day] pipeline deal delete failed:", delErr);

    // Compute celebration data
    const province   = settings?.province ?? "ontario";
    const goalGCI    = settings?.goal_gci ?? 0;
    const _now       = new Date();
    const thisYear   = _now.getFullYear().toString();
    const thisMonth  = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`;
    const ytdBefore  = ytdTransactions.filter(t => t.date?.startsWith(thisYear)).reduce((s, t) => s + t.sale_price * t.commission_pct, 0);
    const dealsMonth = ytdTransactions.filter(t => t.date?.startsWith(thisMonth)).length + 1;
    const dealsYear  = ytdTransactions.filter(t => t.date?.startsWith(thisYear)).length + 1;
    const estRate    = marginalRate(Math.max(ytdBefore + gci, goalGCI), province);

    setCelebData({
      gci, ytdGCIBefore: ytdBefore, goalGCI, province,
      estimatedMarginalRate: estRate, dealsThisMonth: dealsMonth, totalDealsThisYear: dealsYear,
      isGstHstRegistered: settings?.gst_hst_registered ?? false,
      brokerageWithholdsHst: settings?.brokerage_withholds_hst ?? false,
    });
    savingRef.current = false;
    setSaving(false);
    setMode("celebrate");
    setTimeout(() => fireConfetti("goal"), 150);
    router.refresh(); // silently re-fetches server data → updates all dashboard numbers
  }

  async function handleSaveDelay() {
    if (!current || !newDate || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { savingRef.current = false; setSaving(false); return; }
    const { error: delayErr } = await supabase.from("pipeline_deals").update({ expected_close_date: newDate, updated_at: new Date().toISOString() }).eq("id", current.id).eq("user_id", user.id);
    if (delayErr) { toast.error("Failed to update date — please try again."); savingRef.current = false; setSaving(false); return; }
    savingRef.current = false;
    setSaving(false);
    advance();
    router.refresh();
  }

  async function handleCopy() {
    if (!current || !celebData) return;
    const txt = `Just closed ${current.address}. That's ${celebData.totalDealsThisYear} deal${celebData.totalDealsThisYear !== 1 ? "s" : ""} this year. 🏡🔑 #RealEstate #Closed`;
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  if (!open || !current) return null;

  const gci = computeEstimatedGCI(current);

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9990] bg-black/60 backdrop-blur-sm" style={{ animation: "cdFadeIn 0.2s ease-out forwards" }} />

      {/* Modal */}
      <div className="fixed inset-0 z-[9991] flex items-center justify-center p-4 pointer-events-none">
        <style>{`
          @keyframes cdFadeIn  { from{opacity:0} to{opacity:1} }
          @keyframes cdScaleIn { from{opacity:0;transform:scale(0.94)} to{opacity:1;transform:scale(1)} }
        `}</style>
        <div className="pointer-events-auto w-full max-w-md rounded-3xl overflow-hidden shadow-2xl bg-card border border-border/60" style={{ animation: "cdScaleIn 0.25s ease-out forwards" }}>

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          {mode !== "celebrate" && (
            <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 px-6 py-7 text-white">
              <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -left-6 bottom-0 h-28 w-28 rounded-full bg-white/10" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">🏡</span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-100">Closing Day</p>
                    <p className="text-[11px] text-emerald-200">{formatDate(localToday())}</p>
                  </div>
                  {queue.length > 1 && <span className="ml-auto inline-flex items-center justify-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">{queue.length} deals</span>}
                </div>
                <h2 className="text-2xl font-extrabold leading-tight">{current.address || "Your deal"}</h2>
                {current.client_name && (
                  <p className="mt-1 text-sm text-emerald-100 flex items-center gap-1.5"><User className="h-3.5 w-3.5 shrink-0" />{current.client_name}</p>
                )}
              </div>
            </div>
          )}

          <div className="px-6 py-5 space-y-4">

            {/* ── MAIN mode ─────────────────────────────────────────────── */}
            {mode === "main" && (
              <>
                {/* KPI tiles */}
                <div className="grid grid-cols-3 gap-2">
                  <KpiTile icon={<Home className="h-4 w-4" />} label="Side" value={sideLabel(current.side)} color="blue" />
                  <KpiTile icon={<DollarSign className="h-4 w-4" />} label="Est. Price" value={fmtCurrency(current.estimated_price)} color="purple" />
                  <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="Est. GCI" value={fmtCurrency(gci)} color="emerald" />
                </div>
                <div className="rounded-xl bg-muted/50 divide-y divide-border/50 text-sm">
                  <DetailRow icon={<BadgePercent className="h-3.5 w-3.5 text-muted-foreground" />} label="Commission" value={current.estimated_commission_pct != null ? `${(current.estimated_commission_pct * 100).toFixed(2)}%` : "—"} />
                  <DetailRow icon={<CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />} label="Scheduled Close" value={current.expected_close_date ? formatDate(current.expected_close_date) : "—"} />
                  {current.notes && <DetailRow icon={<StickyNote className="h-3.5 w-3.5 text-muted-foreground" />} label="Notes" value={current.notes} />}
                </div>
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">What&apos;s the status?</p>
                  <Button className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm gap-2" onClick={() => setMode("confirm")}>
                    <CalendarCheck className="h-4 w-4" />Yes — it&apos;s closed! 🎉
                  </Button>
                  <Button variant="outline" className="w-full h-10 border-amber-300 text-amber-700 hover:bg-amber-50 text-sm gap-2" onClick={() => { setMode("delayed"); setNewDate(current.expected_close_date ?? ""); }}>
                    <Clock className="h-4 w-4" />It&apos;s been delayed — update date
                  </Button>
                  <Button variant="ghost" className="w-full h-9 text-muted-foreground hover:text-foreground text-xs gap-1.5" onClick={advance}>
                    <Moon className="h-3.5 w-3.5" />Check back tomorrow morning
                  </Button>
                </div>
              </>
            )}

            {/* ── CONFIRM mode ──────────────────────────────────────────── */}
            {mode === "confirm" && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Confirm the final numbers</p>

                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Client Name</Label>
                  <Input value={confirmForm.client_name} onChange={e => setConfirmForm(p => ({ ...p, client_name: e.target.value }))} placeholder="Jane Smith" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Sale Price ($)</Label>
                    <Input type="number" value={confirmForm.sale_price} onChange={e => setConfirmForm(p => ({ ...p, sale_price: e.target.value }))} placeholder="750000" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Commission %</Label>
                    <Input type="number" step="0.25" value={confirmForm.commission_pct} onChange={e => setConfirmForm(p => ({ ...p, commission_pct: e.target.value }))} placeholder="2.5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Side</Label>
                    <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={confirmForm.side} onChange={e => setConfirmForm(p => ({ ...p, side: e.target.value as "buyer" | "seller" | "both" }))}>
                      <option value="buyer">Buyer</option>
                      <option value="seller">Seller</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Close Date</Label>
                    <Input type="date" value={confirmForm.date} onChange={e => setConfirmForm(p => ({ ...p, date: e.target.value }))} />
                  </div>
                </div>

                {/* GCI preview */}
                <p className="text-xs text-muted-foreground text-right">
                  GCI: <span className="font-semibold text-foreground">{fmtCurrency((parseFloat(confirmForm.sale_price) || 0) * ((parseFloat(confirmForm.commission_pct) || 0) / 100))}</span>
                </p>

                <div className="flex gap-2 pt-1">
                  <Button variant="ghost" className="flex-1" onClick={() => setMode("main")}>Back</Button>
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={handleRegisterClose} disabled={saving}>
                    {saving ? "Registering…" : <><PartyPopper className="h-4 w-4" />Register &amp; Close</>}
                  </Button>
                </div>
              </div>
            )}

            {/* ── DELAYED mode ──────────────────────────────────────────── */}
            {mode === "delayed" && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">When is the new closing date?</p>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">New Expected Close Date</Label>
                  <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} min={localToday()} />
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setMode("main")}>Back</Button>
                  <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={handleSaveDelay} disabled={!newDate || saving}>
                    {saving ? "Saving…" : "Update Date"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── CELEBRATE mode ────────────────────────────────────────── */}
            {mode === "celebrate" && celebData && (
              <CelebrationContent
                address={current.address}
                clientName={confirmForm.client_name}
                celebData={celebData}
                quote={quote}
                copied={copied}
                onCopy={handleCopy}
                onClose={() => { markDismissed(current.id); advance(); }}
              />
            )}

          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── CelebrationContent ────────────────────────────────────────────────────────

function CelebrationContent({ address, clientName: _clientName, celebData, quote, copied, onCopy, onClose }: {
  address: string; clientName: string;
  celebData: { gci: number; ytdGCIBefore: number; goalGCI: number; province: string; estimatedMarginalRate: number; dealsThisMonth: number; totalDealsThisYear: number; isGstHstRegistered: boolean; brokerageWithholdsHst: boolean };
  quote: string; copied: boolean; onCopy: () => void; onClose: () => void;
}) {
  const { gci, ytdGCIBefore, goalGCI, province, estimatedMarginalRate, dealsThisMonth, totalDealsThisYear, isGstHstRegistered, brokerageWithholdsHst } = celebData;

  // D-4 fix (Audit 1 2026-04-22): canonical HST helper. Returns 0 when the
  // agent isn't registered OR the brokerage handles HST remittance — so the
  // "reserve for sales tax" line correctly drops off in those cases.
  const salesTaxRate   = gstHstRate(province || "ontario");
  const salesTaxLabel  = gstHstLabel(province || "ontario");
  const salesTaxAmt    = Math.round(
    computeHSTCollected({
      ytdGCI: gci,
      hstRate: salesTaxRate,
      isRegistered: isGstHstRegistered,
      brokerageWithholdsHst,
    }),
  );
  const taxReserve     = Math.round(gci * estimatedMarginalRate);
  const funMoney       = Math.round(gci * 0.10);
  const keepInvest     = Math.max(0, gci - taxReserve - funMoney);
  const ytdAfter       = ytdGCIBefore + gci;
  const goalPct        = goalGCI > 0 ? Math.min(100, Math.round((ytdAfter / goalGCI) * 100)) : 0;

  const MILESTONES_CHECK = [25_000, 50_000, 100_000, 150_000, 200_000, 250_000, 300_000];
  const milestone = MILESTONES_CHECK.find(m => ytdGCIBefore < m && ytdAfter >= m) ?? null;
  const streakLabel = totalDealsThisYear === 1 ? "First deal of the year 🏅" : dealsThisMonth >= 3 ? `${dealsThisMonth} deals this month 🔥` : dealsThisMonth === 2 ? "2 deals this month 🔥" : null;

  return (
    <div className="space-y-4">
      {/* Hero celebration band */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 px-5 py-6 text-white text-center">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-100 mb-1">Deal Closed 🎉</p>
        <p className="text-lg font-bold leading-snug mb-3">{address}</p>
        <p className="text-xs text-emerald-200 mb-1">Commission Earned</p>
        <p className="text-4xl font-extrabold tabular-nums">$<CountUp end={gci} duration={1400} /></p>
        {goalGCI > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-emerald-100 mb-1"><span>YTD Goal</span><span className="font-semibold text-white">{goalPct}% of {fmtCurrency(goalGCI)}</span></div>
            <div className="h-1.5 rounded-full bg-white/20"><div className="h-1.5 rounded-full bg-white transition-all duration-1000" style={{ width: `${goalPct}%` }} /></div>
          </div>
        )}
      </div>

      {/* Badges */}
      {(milestone || streakLabel) && (
        <div className="flex flex-wrap gap-2">
          {milestone && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">🏆 ${(milestone/1000).toFixed(0)}k GCI milestone!</span>}
          {streakLabel && <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 border border-orange-200 px-3 py-1 text-xs font-semibold text-orange-800">{streakLabel}</span>}
        </div>
      )}

      {/* Allocation breakdown */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">How to allocate your commission</p>
        <div className="space-y-1.5">
          <AllocRow icon={<Landmark className="h-3.5 w-3.5" />} color="yellow" label={`${salesTaxLabel} to remit`} amount={salesTaxAmt} rate={salesTaxRate} note="Remit to CRA on your next filing" />
          <AllocRow icon={<Percent className="h-3.5 w-3.5" />} color="red" label="Income tax reserve" amount={taxReserve} rate={estimatedMarginalRate} note={`~${Math.round(estimatedMarginalRate*100)}% marginal rate · portion owed to CRA`} />
          <AllocRow icon={<Sparkles className="h-3.5 w-3.5" />} color="purple" label="Fun money (10%)" amount={funMoney} note="You earned it. Seriously." />
          <AllocRow icon={<PiggyBank className="h-3.5 w-3.5" />} color="blue" label="Keep / invest" amount={keepInvest} note="Savings, RRSP, next month's leads" />
        </div>
      </div>

      {/* Quote */}
      <p className="rounded-xl bg-muted/60 border border-border/40 px-4 py-3 text-xs italic text-muted-foreground">&ldquo;{quote}&rdquo;</p>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onCopy}>
          {copied ? <><Check className="h-3.5 w-3.5 text-emerald-600" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Share the win</>}
        </Button>
        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs" onClick={onClose}>
          <PartyPopper className="h-3.5 w-3.5" />Awesome — let&apos;s go!
        </Button>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: "blue"|"purple"|"emerald" }) {
  const c = { blue: "bg-blue-50 border-blue-200 text-blue-700", purple: "bg-purple-50 border-purple-200 text-purple-700", emerald: "bg-emerald-50 border-emerald-200 text-emerald-700" };
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-center ${c[color]}`}>
      <div className="flex justify-center mb-1 opacity-70">{icon}</div>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xs font-bold mt-0.5 truncate">{value}</p>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="text-xs text-foreground font-medium flex-1 text-right">{value}</span>
    </div>
  );
}

function AllocRow({ icon, color, label, amount, rate, note }: { icon: React.ReactNode; color: "yellow"|"red"|"purple"|"blue"; label: string; amount: number; rate?: number; note: string }) {
  const c = { yellow: "bg-yellow-50 border-yellow-200 text-yellow-800", red: "bg-red-50 border-red-200 text-red-800", purple: "bg-purple-50 border-purple-200 text-purple-800", blue: "bg-blue-50 border-blue-200 text-blue-800" };
  const ic = { yellow: "bg-yellow-100 text-yellow-700", red: "bg-red-100 text-red-700", purple: "bg-purple-100 text-purple-700", blue: "bg-blue-100 text-blue-700" };
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 ${c[color]}`}>
      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ic[color]}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">{label}{rate !== undefined && <span className="ml-1 font-normal opacity-70">({Math.round(rate*100)}%)</span>}</p>
          <p className="text-sm font-bold tabular-nums shrink-0">{fmtCurrency(amount)}</p>
        </div>
        <p className="text-[10px] opacity-70 mt-0.5">{note}</p>
      </div>
    </div>
  );
}
