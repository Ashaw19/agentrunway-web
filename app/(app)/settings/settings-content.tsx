"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Sparkles, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  PROVINCE_LABELS,
  type Province,
  type SplitPreset,
  type UserSettings,
} from "@/lib/types/database";

interface Props {
  settings: UserSettings;
}

const SPLIT_OPTIONS: { value: SplitPreset; label: string }[] = [
  { value: "p70_30", label: "70 / 30" },
  { value: "p75_25", label: "75 / 25" },
  { value: "p80_20", label: "80 / 20" },
  { value: "p85_15", label: "85 / 15" },
  { value: "p90_10", label: "90 / 10" },
  { value: "p95_5", label: "95 / 5" },
  { value: "p100_0", label: "100 / 0" },
];

function useSaved() {
  const [saved, setSaved] = useState(false);
  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }
  return { saved, flash };
}

export function SettingsContent({ settings }: Props) {
  // ── Section 1: Province ──────────────────────────────────────────────────
  const [province, setProvince] = useState<Province>(settings.province);
  const [savingProvince, setSavingProvince] = useState(false);
  const provinceSaved = useSaved();

  async function saveProvince() {
    setSavingProvince(true);
    const supabase = createClient();
    await supabase
      .from("user_settings")
      .update({ province })
      .eq("user_id", settings.user_id);
    setSavingProvince(false);
    provinceSaved.flash();
    toast.success("Province updated ✓");
  }

  // ── Section 2: Commission Structure ─────────────────────────────────────
  const [splitPreset, setSplitPreset] = useState<SplitPreset>(
    settings.split_preset,
  );
  const [savingSplit, setSavingSplit] = useState(false);
  const splitSaved = useSaved();

  async function saveSplit() {
    setSavingSplit(true);
    const supabase = createClient();
    await supabase
      .from("user_settings")
      .update({ split_preset: splitPreset })
      .eq("user_id", settings.user_id);
    setSavingSplit(false);
    splitSaved.flash();
    toast.success("Commission split locked in ✓");
  }

  // ── Section 3: Brokerage Fees ────────────────────────────────────────────
  const [monthlyFee, setMonthlyFee] = useState(
    String(settings.monthly_brokerage_fee ?? 0),
  );
  const [txFeeRate, setTxFeeRate] = useState(
    String((settings.tx_fee_rate_pct ?? 0) * 100),
  );
  const [txFeeCap, setTxFeeCap] = useState(
    String(settings.tx_fee_annual_cap ?? 0),
  );
  const [savingFees, setSavingFees] = useState(false);
  const feesSaved = useSaved();

  async function saveFees() {
    setSavingFees(true);
    const supabase = createClient();
    await supabase
      .from("user_settings")
      .update({
        monthly_brokerage_fee: parseFloat(monthlyFee) || 0,
        tx_fee_rate_pct: (parseFloat(txFeeRate) || 0) / 100,
        tx_fee_annual_cap: parseFloat(txFeeCap) || 0,
      })
      .eq("user_id", settings.user_id);
    setSavingFees(false);
    feesSaved.flash();
    toast.success("Brokerage fees saved ✓");
  }

  // ── Section 4: Runway Inputs ─────────────────────────────────────────────
  const [cashReserve, setCashReserve] = useState(
    String(settings.cash_reserve ?? 0),
  );
  const [experienceYears, setExperienceYears] = useState(
    settings.experience_years != null ? String(settings.experience_years) : "",
  );
  const [savingRunway, setSavingRunway] = useState(false);
  const runwaySaved = useSaved();

  // ── Section 5: Annual Goal ───────────────────────────────────────────────
  const [goalGCI, setGoalGCI] = useState(String(settings.goal_gci ?? 0));
  const [savingGoal, setSavingGoal] = useState(false);
  const goalSaved = useSaved();

  // ── Section 6: 5-Year Growth Plan ───────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const [growthGoals, setGrowthGoals] = useState<number[]>(() => {
    const raw = settings.growth_goal_year_pcts;
    if (Array.isArray(raw) && raw.length === 5) return raw.map(Number);
    return [0, 0, 0, 0, 0];
  });
  const [savingGoals, setSavingGoals] = useState(false);
  const growthGoalsSaved = useSaved();

  async function saveGrowthGoals() {
    setSavingGoals(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("user_settings")
      .update({ growth_goal_year_pcts: growthGoals })
      .eq("user_id", settings.user_id);
    setSavingGoals(false);
    if (!error) {
      growthGoalsSaved.flash();
      toast.success("Growth plan saved ✓");
    } else {
      toast.error("Couldn't save growth goals — please try again.");
    }
  }

  async function saveGoal() {
    setSavingGoal(true);
    const supabase = createClient();
    await supabase
      .from("user_settings")
      .update({ goal_gci: parseFloat(goalGCI) || 0 })
      .eq("user_id", settings.user_id);
    setSavingGoal(false);
    goalSaved.flash();
    toast.success("Annual goal updated ✓");
  }

  async function saveRunway() {
    setSavingRunway(true);
    const supabase = createClient();
    await supabase
      .from("user_settings")
      .update({
        cash_reserve: parseFloat(cashReserve) || 0,
        experience_years: experienceYears
          ? parseInt(experienceYears) || null
          : null,
      })
      .eq("user_id", settings.user_id);
    setSavingRunway(false);
    runwaySaved.flash();
    toast.success("Cash reserve updated ✓");
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-border/60 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Garbage in, garbage out. Keep these honest.
        </p>
      </div>

      {/* Card 1 — Province & Tax */}
      <Card className="rounded-2xl border-l-4 border-l-blue-500 shadow-sm">
        <CardHeader>
          <CardTitle>Province &amp; Tax</CardTitle>
          <CardDescription>
            Used for tax estimates and GST/HST rates.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Province / Territory</Label>
            <Select
              value={province}
              onValueChange={(v) => setProvince(v as Province)}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROVINCE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SaveRow
            saving={savingProvince}
            saved={provinceSaved.saved}
            onSave={saveProvince}
          />
        </CardContent>
      </Card>

      {/* Card 2 — Commission Structure */}
      <Card className="rounded-2xl border-l-4 border-l-violet-500 shadow-sm">
        <CardHeader>
          <CardTitle>Commission Structure</CardTitle>
          <CardDescription>
            Your agent / brokerage revenue split on each deal.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Commission Split (Agent / Brokerage)</Label>
            <Select
              value={splitPreset}
              onValueChange={(v) => setSplitPreset(v as SplitPreset)}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPLIT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SaveRow
            saving={savingSplit}
            saved={splitSaved.saved}
            onSave={saveSplit}
          />
        </CardContent>
      </Card>

      {/* Card 3 — Brokerage Fees */}
      <Card className="rounded-2xl border-l-4 border-l-amber-500 shadow-sm">
        <CardHeader>
          <CardTitle>Brokerage Fees</CardTitle>
          <CardDescription>
            Recurring and per-deal fees charged by your brokerage.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Monthly Fee ($)</Label>
              <Input
                type="number"
                placeholder="0"
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Desk / tech fee per month.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>Transaction Fee Rate (%)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="0"
                value={txFeeRate}
                onChange={(e) => setTxFeeRate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Fee charged per closed deal.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>Annual Fee Cap ($)</Label>
              <Input
                type="number"
                placeholder="0"
                value={txFeeCap}
                onChange={(e) => setTxFeeCap(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter 0 for no annual cap.
              </p>
            </div>
          </div>
          <SaveRow
            saving={savingFees}
            saved={feesSaved.saved}
            onSave={saveFees}
          />
        </CardContent>
      </Card>

      {/* Card 4 — Runway Inputs */}
      <Card className="rounded-2xl border-l-4 border-l-emerald-500 shadow-sm">
        <CardHeader>
          <CardTitle>Runway Inputs</CardTitle>
          <CardDescription>
            Powers your cash runway and benchmark calculations.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Cash Reserve ($)</Label>
              <Input
                type="number"
                placeholder="0"
                value={cashReserve}
                onChange={(e) => setCashReserve(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your liquid savings or operating account balance — what you&apos;d
                live on if commissions stopped tomorrow. Drives your cash runway
                estimate and financial risk score.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>Years of Experience</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 5"
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Years licensed as an agent — used for benchmark peer comparison.
              </p>
            </div>
          </div>
          <SaveRow
            saving={savingRunway}
            saved={runwaySaved.saved}
            onSave={saveRunway}
          />
        </CardContent>
      </Card>

      {/* Card 5 — Annual Goal */}
      <Card className="rounded-2xl border-l-4 border-l-orange-500 shadow-sm">
        <CardHeader>
          <CardTitle>Annual Goal</CardTitle>
          <CardDescription>
            Your target GCI for the year — drives pace tracking and dashboard forecasts.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5 max-w-xs">
            <Label>Annual GCI Target ($)</Label>
            <Input
              type="number"
              placeholder="e.g. 100000"
              value={goalGCI}
              onChange={(e) => setGoalGCI(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Used for pace scoring, goal progress, and projection benchmarks.
            </p>
          </div>
          <SaveRow
            saving={savingGoal}
            saved={goalSaved.saved}
            onSave={saveGoal}
          />
        </CardContent>
      </Card>

      {/* Card 6 — 5-Year Growth Plan */}
      <Card id="growth-plan" className="rounded-2xl border-l-4 border-l-violet-500 shadow-sm">
        <CardHeader>
          <CardTitle>5-Year Growth Plan</CardTitle>
          <CardDescription>
            Your GCI targets for the next five years — used to plot your growth trajectory on the Forecast page.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="grid gap-1.5">
                <Label>{currentYear + 1 + i} Target ($)</Label>
                <Input
                  type="number"
                  placeholder="$0"
                  value={growthGoals[i] === 0 ? "" : growthGoals[i]}
                  onChange={(e) =>
                    setGrowthGoals((prev) => {
                      const next = [...prev];
                      next[i] = parseFloat(e.target.value) || 0;
                      return next;
                    })
                  }
                />
              </div>
            ))}
          </div>
          <div className="grid gap-1.5 max-w-xs">
            <Label>{currentYear + 5} Target ($)</Label>
            <Input
              type="number"
              placeholder="$0"
              value={growthGoals[4] === 0 ? "" : growthGoals[4]}
              onChange={(e) =>
                setGrowthGoals((prev) => {
                  const next = [...prev];
                  next[4] = parseFloat(e.target.value) || 0;
                  return next;
                })
              }
            />
          </div>
          <SaveRow
            saving={savingGoals}
            saved={growthGoalsSaved.saved}
            onSave={saveGrowthGoals}
          />
        </CardContent>
      </Card>

      {/* Card 7 — Plan & Billing */}
      <PlanBillingCard settings={settings} />
    </div>
  );
}

// ── Plan & Billing card ───────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  team: "Team",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  trialing: "bg-blue-100 text-blue-700",
  past_due: "bg-amber-100 text-amber-700",
  canceled: "bg-slate-100 text-slate-600",
  unpaid: "bg-red-100 text-red-700",
  free: "bg-slate-100 text-slate-600",
};

function PlanBillingCard({ settings }: { settings: UserSettings }) {
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [portalError, setPortalError] = useState("");

  const tier = settings.subscription_tier ?? "starter";
  const status = settings.subscription_status ?? "free";
  const isPro = tier === "professional" || tier === "team";
  const renewalDate = settings.subscription_current_period_end
    ? new Date(settings.subscription_current_period_end).toLocaleDateString(
        "en-CA",
        { year: "numeric", month: "long", day: "numeric" },
      )
    : null;

  async function openPortal() {
    setLoadingPortal(true);
    setPortalError("");
    try {
      const res = await fetch("/api/customer-portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; message?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPortalError(data.message ?? data.error ?? "Something went wrong. Please try again.");
        setLoadingPortal(false);
      }
    } catch {
      setPortalError("Could not connect. Please try again.");
      setLoadingPortal(false);
    }
  }

  return (
    <Card className="rounded-2xl border-l-4 border-l-indigo-500 shadow-sm">
      <CardHeader>
        <CardTitle>Plan &amp; Billing</CardTitle>
        <CardDescription>
          Your current subscription and billing management.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plan row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-semibold">
                {TIER_LABELS[tier] ?? tier} Plan
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.free}`}
                >
                  {status === "free" ? "free" : status.replace("_", " ")}
                </span>
                {status === "trialing" && renewalDate && (
                  <span className="text-xs text-muted-foreground">
                    Trial ends {renewalDate}
                  </span>
                )}
                {status === "active" && renewalDate && (
                  <span className="text-xs text-muted-foreground">
                    Renews {renewalDate}
                  </span>
                )}
              </div>
            </div>
          </div>

          {isPro ? (
            <Button
              variant="outline"
              size="sm"
              onClick={openPortal}
              disabled={loadingPortal}
              className="shrink-0"
            >
              {loadingPortal ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
              )}
              {loadingPortal ? "Opening…" : "Manage Subscription"}
            </Button>
          ) : (
            <Link
              href="/pricing"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Upgrade to Professional
            </Link>
          )}
        </div>

        {/* Error message */}
        {portalError && (
          <p className="text-xs text-destructive">{portalError}</p>
        )}

        {/* Starter info */}
        {!isPro && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Upgrade to Professional for runway scoring, probability-weighted forecasts,
            PDF reports, AI insights, tax planning tools, and CREA benchmarking.
            Starts with a 14-day free trial — no credit card required.
          </p>
        )}

        {/* Portal note for Pro */}
        {isPro && (
          <p className="text-xs text-muted-foreground">
            Update your payment method, download invoices, or cancel from the Stripe billing portal.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Shared save row ──────────────────────────────────────────────────────────
function SaveRow({
  saving,
  saved,
  onSave,
}: {
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" onClick={onSave} disabled={saving} size="sm">
        {saving ? "Saving…" : "Save"}
      </Button>
      {saved && (
        <span className="flex items-center gap-1 text-sm text-green-600">
          <Check className="h-3.5 w-3.5" />
          Saved
        </span>
      )}
    </div>
  );
}
