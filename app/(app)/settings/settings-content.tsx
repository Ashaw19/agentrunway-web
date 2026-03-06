"use client";

import { useState } from "react";
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
import { Check } from "lucide-react";
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
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account preferences and calculations.
        </p>
      </div>

      {/* Card 1 — Province & Tax */}
      <Card>
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
      <Card>
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
      <Card>
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
      <Card>
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
                Current cash on hand — used to calculate how many months you can
                sustain at current expenses.
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
    </div>
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
      <Button onClick={onSave} disabled={saving} size="sm">
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
