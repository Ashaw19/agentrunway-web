"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Progress } from "@/components/ui/progress";
import { Plane, ArrowRight, ArrowLeft, Check } from "lucide-react";
import {
  PROVINCE_LABELS,
  type Province,
  type SplitPreset,
} from "@/lib/types/database";

const SPLIT_OPTIONS: { value: SplitPreset; label: string }[] = [
  { value: "p70_30", label: "70 / 30" },
  { value: "p75_25", label: "75 / 25" },
  { value: "p80_20", label: "80 / 20" },
  { value: "p85_15", label: "85 / 15" },
  { value: "p90_10", label: "90 / 10" },
  { value: "p95_5", label: "95 / 5" },
  { value: "p100_0", label: "100 / 0" },
];

const STEPS = ["Province", "Split", "Goals", "Done"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form state
  const [province, setProvince] = useState<Province>("ontario");
  const [splitPreset, setSplitPreset] = useState<SplitPreset>("p80_20");
  const [goalGCI, setGoalGCI] = useState("");
  const [goalTx, setGoalTx] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");

  async function handleFinish() {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("user_settings")
      .update({
        province,
        split_preset: splitPreset,
        goal_gci: parseFloat(goalGCI) || 0,
        goal_transactions: parseInt(goalTx) || 0,
        monthly_brokerage_fee: parseFloat(monthlyFee) || 0,
      })
      .eq("user_id", user.id);

    router.push("/dashboard");
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="h-5 w-5" />
          </div>
          <CardTitle>Welcome to Agent Runway</CardTitle>
          <CardDescription>
            Let&apos;s set up your account — {STEPS[step]}
          </CardDescription>
          <Progress value={progress} className="mt-3 h-1.5" />
        </CardHeader>

        <CardContent className="min-h-[260px]">
          {/* Step 0: Province */}
          {step === 0 && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Province / Territory</Label>
                <Select
                  value={province}
                  onValueChange={(v) => setProvince(v as Province)}
                >
                  <SelectTrigger>
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
                <p className="text-xs text-muted-foreground">
                  Used for tax estimates and GST/HST rates.
                </p>
              </div>
            </div>
          )}

          {/* Step 1: Commission split */}
          {step === 1 && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Commission Split (Agent / Brokerage)</Label>
                <Select
                  value={splitPreset}
                  onValueChange={(v) => setSplitPreset(v as SplitPreset)}
                >
                  <SelectTrigger>
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
              <div className="grid gap-2">
                <Label>Monthly Brokerage Fee ($)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={monthlyFee}
                  onChange={(e) => setMonthlyFee(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Desk/tech fee charged monthly by your brokerage.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Goals */}
          {step === 2 && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Annual GCI Goal ($)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 150000"
                  value={goalGCI}
                  onChange={(e) => setGoalGCI(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Transaction Goal (deals)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 20"
                  value={goalTx}
                  onChange={(e) => setGoalTx(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                These power your pace tracking and projections. You can change
                them later in settings.
              </p>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold">You&apos;re all set!</h3>
              <p className="text-sm text-muted-foreground">
                Your account is configured. Head to the dashboard to start
                tracking your business.
              </p>
            </div>
          )}
        </CardContent>

        {/* Navigation */}
        <div className="flex justify-between border-t px-6 py-4">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Next
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={saving}>
              {saving ? "Saving..." : "Go to Dashboard"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
