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
import { Check, Sparkles, ExternalLink, Loader2, Car, Landmark, RefreshCw, Trash2, Clock, Info, AlertCircle, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlaidLinkButton } from "@/components/plaid-link";
import {
  PROVINCE_LABELS,
  type Province,
  type SplitPreset,
  type UserSettings,
  type PlaidItem,
} from "@/lib/types/database";

interface Props {
  settings: UserSettings;
  plaidItems?: PlaidItem[];
  plaidConfigured?: boolean;
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

export function SettingsContent({ settings, plaidItems: initialPlaidItems = [], plaidConfigured = false }: Props) {
  const router = useRouter();

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

  // ── Section 7: Vehicle & Mileage ────────────────────────────────────────
  const [vehiclePct, setVehiclePct] = useState<string>(
    settings.vehicle_business_use_pct != null
      ? String(Math.round(Number(settings.vehicle_business_use_pct) * 100))
      : "0",
  );
  const [savingVehicle, setSavingVehicle] = useState(false);
  const vehicleSaved = useSaved();

  async function saveVehiclePct() {
    const pct = Math.min(100, Math.max(0, parseFloat(vehiclePct) || 0)) / 100;
    setSavingVehicle(true);
    const supabase = createClient();
    await supabase
      .from("user_settings")
      .update({ vehicle_business_use_pct: pct })
      .eq("user_id", settings.user_id);
    setSavingVehicle(false);
    vehicleSaved.flash();
    toast.success("Vehicle business use % saved ✓");
  }

  // ── Section 8: Bank Connections ──────────────────────────────────────────
  const [plaidItems, setPlaidItems] = useState<PlaidItem[]>(initialPlaidItems);
  const [syncingId,  setSyncingId]  = useState<string | null>(null);
  const [connectErr, setConnectErr] = useState<string | null>(null);

  function fmtRelative(isoTs: string | null) {
    if (!isoTs) return "Never";
    const diff = Date.now() - new Date(isoTs).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 2) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  async function handleSync(itemId: string) {
    setSyncingId(itemId);
    try {
      const res = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      if (res.ok) {
        setPlaidItems((prev) =>
          prev.map((i) => i.id === itemId ? { ...i, last_synced_at: new Date().toISOString() } : i),
        );
        router.refresh();
      }
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDisconnect(itemId: string) {
    const res = await fetch("/api/plaid/disconnect", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    });
    if (res.ok) {
      setPlaidItems((prev) => prev.filter((i) => i.id !== itemId));
    }
  }

  function handlePlaidSuccess({ item_id, institution_name }: { item_id: string; institution_name: string }) {
    setConnectErr(null);
    setPlaidItems((prev) => [
      {
        id: item_id, user_id: "", plaid_item_id: "",
        institution_id: null, institution_name, sync_cursor: null,
        last_synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    // Trigger initial sync
    setSyncingId(item_id);
    fetch("/api/plaid/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id }),
    }).finally(() => {
      setSyncingId(null);
      router.refresh();
    });
  }

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
            Your target GCI growth rate for each of the next five years. Enter a percentage — e.g. <strong>10</strong> for 10% growth. Each year compounds from the previous one. Used to plot your trajectory on the Forecast page.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="grid gap-1.5">
                <Label>{currentYear + 1 + i} growth rate</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.5"
                    min="-50"
                    max="200"
                    placeholder="0"
                    className="pr-8"
                    value={growthGoals[i] === 0 ? "" : growthGoals[i]}
                    onChange={(e) =>
                      setGrowthGoals((prev) => {
                        const next = [...prev];
                        next[i] = parseFloat(e.target.value) || 0;
                        return next;
                      })
                    }
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-1.5 max-w-xs">
            <Label>{currentYear + 5} growth rate</Label>
            <div className="relative">
              <Input
                type="number"
                step="0.5"
                min="-50"
                max="200"
                placeholder="0"
                className="pr-8"
                value={growthGoals[4] === 0 ? "" : growthGoals[4]}
                onChange={(e) =>
                  setGrowthGoals((prev) => {
                    const next = [...prev];
                    next[4] = parseFloat(e.target.value) || 0;
                    return next;
                  })
                }
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <SaveRow
            saving={savingGoals}
            saved={growthGoalsSaved.saved}
            onSave={saveGrowthGoals}
          />
        </CardContent>
      </Card>

      {/* Card 7 — Vehicle & Mileage */}
      <Card className="rounded-2xl border-l-4 border-l-blue-400 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-blue-500" />
            <CardTitle>Vehicle &amp; Mileage</CardTitle>
          </div>
          <CardDescription>
            Set your vehicle business use % for actual expense deductions.
            Use the Mileage tab in Expenses to track the CRA per-km method instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5 max-w-xs">
            <Label>Vehicle business use %</Label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="e.g. 80"
                className="pr-8"
                value={vehiclePct}
                onChange={(e) => setVehiclePct(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              % of your total vehicle costs used for business (e.g. 80 = 80% business use).
              Applies when you claim actual vehicle expenses vs. the per-km mileage method.
            </p>
          </div>
          <SaveRow
            saving={savingVehicle}
            saved={vehicleSaved.saved}
            onSave={saveVehiclePct}
          />
        </CardContent>
      </Card>

      {/* Card 8 — Bank Connections */}
      <Card className="rounded-2xl border-l-4 border-l-cyan-400 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-cyan-500" />
              <div>
                <CardTitle>Bank Connections</CardTitle>
                <CardDescription className="mt-0.5">
                  Connect bank accounts to auto-import transactions.
                  Review them in the{" "}
                  <Link href="/expenses" className="underline underline-offset-2">
                    Bank Imports tab
                  </Link>{" "}
                  on Expenses.
                </CardDescription>
              </div>
            </div>
            {plaidConfigured && (
              <PlaidLinkButton
                onSuccess={handlePlaidSuccess}
                onError={(msg) => setConnectErr(msg)}
                label="Add Bank Account"
                variant="outline"
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectErr && (
            <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{connectErr}</span>
              <button onClick={() => setConnectErr(null)} className="ml-auto">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          )}

          {!plaidConfigured && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <Info className="h-4 w-4" />
                Plaid credentials not configured
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Add <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">PLAID_CLIENT_ID</code>,{" "}
                <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">PLAID_SECRET</code>, and{" "}
                <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">PLAID_ENV</code> to your environment variables to enable bank sync.
              </p>
            </div>
          )}

          {plaidItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Landmark className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">No bank accounts connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {plaidConfigured
                    ? 'Click "Add Bank Account" above to get started.'
                    : "Configure Plaid credentials to enable bank sync."}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {plaidItems.map((item) => {
                const isSyncing = syncingId === item.id;
                return (
                  <div key={item.id} className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {item.institution_name ?? "Bank Account"}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtRelative(item.last_synced_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSync(item.id)}
                        disabled={isSyncing}
                        className="flex-1 text-xs h-8"
                      >
                        {isSyncing
                          ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Syncing…</>
                          : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sync Now</>}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Disconnect {item.institution_name ?? "this bank"}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the bank connection and any pending (unapproved) imported transactions.
                              Approved expenses already saved will not be affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDisconnect(item.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Disconnect
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 9 — Plan & Billing */}
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
