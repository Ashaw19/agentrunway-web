"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  MapPin,
  User,
  Building2,
  DollarSign,
  Clock,
  Palette,
  Target,
  Rocket,
  Globe,
} from "lucide-react";
import {
  PROVINCE_LABELS,
  type Province,
  type SplitPreset,
} from "@/lib/types/database";

// ── Constants ─────────────────────────────────────────────────────────────────

const SPLIT_OPTIONS: { value: SplitPreset; agentPct: number }[] = [
  { value: "p70_30", agentPct: 70 },
  { value: "p75_25", agentPct: 75 },
  { value: "p80_20", agentPct: 80 },
  { value: "p85_15", agentPct: 85 },
  { value: "p90_10", agentPct: 90 },
  { value: "p95_5", agentPct: 95 },
  { value: "p100_0", agentPct: 100 },
];

const EXPERIENCE_OPTIONS = [
  {
    range: "0-2",
    years: 1,
    label: "Fresh Off the Block",
    range_label: "0–2 years",
    subtitle: "Still figuring it out — and that's perfectly fine.",
  },
  {
    range: "2-5",
    years: 3,
    label: "Finding My Groove",
    range_label: "2–5 years",
    subtitle: "Momentum building. Deals closing. Name spreading.",
  },
  {
    range: "5-10",
    years: 7,
    label: "Battle-Tested",
    range_label: "5–10 years",
    subtitle: "You've seen the market cycle at least once. Maybe twice.",
  },
  {
    range: "10+",
    years: 15,
    label: "Veteran Status",
    range_label: "10+ years",
    subtitle: "You've survived enough market shifts to write the textbook.",
  },
];

const COLOR_THEMES = [
  {
    value: "blue",
    label: "The Classic",
    hex: "#1E72F2",
    bg: "oklch(0.57 0.240 261)",
    desc: "Trusted. Reliable. Blue is always right.",
  },
  {
    value: "violet",
    label: "The Visionary",
    hex: "#7C3AED",
    bg: "oklch(0.56 0.24 285)",
    desc: "Purple reigns. Pipeline energy.",
  },
  {
    value: "emerald",
    label: "The Closer",
    hex: "#10B981",
    bg: "oklch(0.66 0.19 150)",
    desc: "Money-coloured. Coincidence? Probably not.",
  },
  {
    value: "orange",
    label: "The Bold",
    hex: "#F97316",
    bg: "oklch(0.71 0.21 41)",
    desc: "Velocity orange. Not for the faint of heart.",
  },
  {
    value: "rose",
    label: "The Disruptor",
    hex: "#F43F5E",
    bg: "oklch(0.58 0.23 15)",
    desc: "Confident. A little dangerous. Unforgettable.",
  },
];

// Step indices: 0=welcome, 1=language, 2=province, 3=about, 4=structure, 5=money, 6=experience, 7=theme, 8=goals, 9=done
const TOTAL_STEPS = 10;

const LANGUAGE_OPTIONS = [
  { code: "en", native: "English", english: "English" },
  { code: "fr", native: "Fran\u00e7ais", english: "Canadian French" },
  { code: "zh", native: "\u4e2d\u6587", english: "Mandarin" },
  { code: "pa", native: "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40", english: "Punjabi" },
  { code: "yue", native: "\u5ee3\u6771\u8a71", english: "Cantonese" },
  { code: "es", native: "Espa\u00f1ol", english: "Spanish" },
  { code: "fil", native: "Filipino", english: "Filipino" },
  { code: "ar", native: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629", english: "Arabic" },
  { code: "hi", native: "\u0939\u093f\u0928\u094d\u0926\u0940", english: "Hindi" },
  { code: "ur", native: "\u0627\u0631\u062f\u0648", english: "Urdu" },
];
const NAMED_STEPS = TOTAL_STEPS - 2; // excludes welcome and done

// ── Main Component ────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  // Form state
  const [language, setLanguage] = useState("en");
  const [province, setProvince] = useState<Province>("ontario");
  const [displayName, setDisplayName] = useState("");
  const [brokerageName, setBrokerageName] = useState("");
  const [phone, setPhone] = useState("");
  const [splitPreset, setSplitPreset] = useState<SplitPreset>("p80_20");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [txFeeRate, setTxFeeRate] = useState("");
  const [txFeeCap, setTxFeeCap] = useState("");
  const [experienceRange, setExperienceRange] = useState("");
  const [experienceYears, setExperienceYears] = useState<number>(1);
  const [colorTheme, setColorTheme] = useState("blue");
  const [cashReserve, setCashReserve] = useState("");
  const [goalGCI, setGoalGCI] = useState("");
  const [goalTx, setGoalTx] = useState("");
  const [goalVolume, setGoalVolume] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Business structure & tax filing
  const [filingFrequency, setFilingFrequency] = useState<"monthly" | "quarterly" | "annual">("quarterly");
  const [isIncorporated, setIsIncorporated] = useState(false);
  const [corpType, setCorpType] = useState<"prec" | "general">("prec");
  const [compensationMethod, setCompensationMethod] = useState<"salary" | "dividends" | "mixed">("salary");
  const [hasEmployees, setHasEmployees] = useState(false);
  const [numEmployees, setNumEmployees] = useState("");
  const [brokerageWithholdsHst, setBrokerageWithholdsHst] = useState(false);

  // Team context — detect if this user joined via team invite
  const [teamInfo, setTeamInfo] = useState<{ orgName: string; leaderName: string } | null>(null);

  useEffect(() => {
    setMounted(true);

    // Check if user has a team membership (accepted invite before onboarding)
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: membership } = await supabase
          .from("organization_members")
          .select("org_id, organizations(name)")
          .eq("user_id", user.id)
          .in("status", ["active", "pending"])
          .maybeSingle();
        if (membership?.org_id) {
          const orgData = membership.organizations as unknown as { name: string } | { name: string }[] | null;
          const orgName = (Array.isArray(orgData) ? orgData[0]?.name : orgData?.name) ?? "your team";
          // Find the team leader's display name
          const { data: leader } = await supabase
            .from("organization_members")
            .select("user_id")
            .eq("org_id", membership.org_id)
            .in("role", ["owner", "team_leader"])
            .limit(1)
            .maybeSingle();
          let leaderName = "your team leader";
          if (leader?.user_id) {
            const { data: leaderSettings } = await supabase
              .from("user_settings")
              .select("display_name")
              .eq("user_id", leader.user_id)
              .maybeSingle();
            if (leaderSettings?.display_name) {
              leaderName = leaderSettings.display_name.split(" ")[0]; // first name only
            }
          }
          setTeamInfo({ orgName, leaderName });
        }
      } catch {
        // Non-critical — team info is just a nice-to-have in onboarding
      }
    })();
  }, []);

  // Pre-fill a suggested GCI goal when the user reaches step 8, based on experience
  useEffect(() => {
    if (step === 8 && !goalGCI) {
      const suggested =
        experienceYears <= 2 ? "75000" :
        experienceYears <= 5 ? "100000" :
        experienceYears <= 10 ? "150000" : "200000";
      setGoalGCI(suggested);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  function advance() {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleFinish() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        savingRef.current = false;
        setSaving(false);
        return;
      }

      // Suggested goal fallback — ensures goal_gci > 0 so the dashboard
      // redirect guard (goal_gci === 0) never triggers for completed onboardings.
      const suggestedGoal =
        experienceYears <= 2 ? 75000 :
        experienceYears <= 5 ? 100000 :
        experienceYears <= 10 ? 150000 : 200000;

      const { error } = await supabase
        .from("user_settings")
        .update({
          province,
          display_name: displayName.trim(),
          brokerage_name: brokerageName.trim(),
          phone: phone.trim(),
          split_preset: splitPreset,
          monthly_brokerage_fee: parseFloat(monthlyFee) || 0,
          tx_fee_rate_pct: parseFloat(txFeeRate)
            ? parseFloat(txFeeRate) / 100
            : 0,
          tx_fee_annual_cap: parseFloat(txFeeCap) || 0,
          experience_years: experienceRange ? experienceYears : null,
          cash_reserve: parseFloat(cashReserve) || 0,
          color_theme: colorTheme,
          goal_gci: parseFloat(goalGCI) || suggestedGoal,
          goal_transactions: parseInt(goalTx) || 0,
          goal_volume: parseFloat(goalVolume) || 0,
          is_incorporated: isIncorporated,
          corp_type: isIncorporated ? corpType : null,
          compensation_method: isIncorporated ? compensationMethod : "salary",
          has_employees: hasEmployees,
          num_employees: hasEmployees ? parseInt(numEmployees) || 1 : 0,
          filing_frequency: filingFrequency,
          brokerage_withholds_hst: brokerageWithholdsHst,
          preferred_language: language,
        })
        .eq("user_id", user.id);

      // Persist locale to cookie for next-intl
      document.cookie = `NEXT_LOCALE=${language};path=/;max-age=31536000`;

      if (error) {
        toast.error("Failed to save your settings. Please try again.");
        savingRef.current = false;
        setSaving(false);
        return;
      }

      // If user has pending org memberships (just accepted an invite),
      // send them to /consent to activate their membership first.
      const { count: pendingOrgs } = await supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending");

      savingRef.current = false;
      setSaving(false);
      router.push(pendingOrgs && pendingOrgs > 0 ? "/consent" : "/dashboard");
    } catch (err) {
      console.error("Onboarding save error:", err);
      toast.error("Something went wrong. Please try again.");
      savingRef.current = false;
      setSaving(false);
    }
  }

  const selectedTheme =
    COLOR_THEMES.find((t) => t.value === colorTheme) ?? COLOR_THEMES[0];
  const agentPct = parseInt(splitPreset.match(/p(\d+)/)?.[1] ?? "80");
  const brokeragePct = 100 - agentPct;

  // Step in the "1–6" range (for progress dots display)
  const progressStep = step > 0 && step < TOTAL_STEPS - 1 ? step : null;

  if (!mounted) return null;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-8"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.15 0.065 265) 0%, oklch(0.10 0.055 265) 100%)",
      }}
    >
      {/* Progress header — shown for steps 1–8 */}
      {progressStep !== null && (
        <div className="mb-7 flex flex-col items-center gap-3">
          <LogoMark size={38} />
          {/* Dot progress indicator */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: NAMED_STEPS }, (_, i) => {
              const dotStep = i + 1;
              const isActive = dotStep === progressStep;
              const isDone = dotStep < progressStep;
              return (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    isActive
                      ? "w-6 bg-white"
                      : isDone
                        ? "w-4 bg-white/60"
                        : "w-4 bg-white/20",
                  )}
                />
              );
            })}
          </div>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-white/30 uppercase">
            Step {progressStep} of {NAMED_STEPS}
          </p>
        </div>
      )}

      {/* Main card */}
      <div
        className="w-full max-w-[480px] rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: "oklch(0.18 0.06 265)" }}
      >
        <div className="p-7 sm:p-8">
          {/* Step 0: Welcome */}
          {step === 0 && <WelcomeStep onContinue={advance} teamInfo={teamInfo} />}

          {/* Step 1: Language */}
          {step === 1 && (
            <StepFrame
              icon={<Globe className="h-5 w-5" />}
              title="Choose Your Language / Choisissez votre langue"
              subtitle="First question. Easy one. We support 10 languages — pick yours and we'll remember it."
            >
              <div className="grid grid-cols-2 gap-3">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      document.cookie = `NEXT_LOCALE=${lang.code};path=/;max-age=31536000`;
                    }}
                    className={cn(
                      "flex flex-col items-center rounded-xl border p-4 text-center transition-all",
                      language === lang.code
                        ? "border-primary bg-primary/15 shadow-inner"
                        : "border-white/20 bg-white/5 hover:border-white/40",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[15px] font-semibold",
                        language === lang.code
                          ? "text-primary"
                          : "text-white/90",
                      )}
                    >
                      {lang.native}
                    </span>
                    <span className="mt-0.5 text-[11px] text-white/40">
                      {lang.english}
                    </span>
                    {language === lang.code && (
                      <Check className="mt-2 h-3.5 w-3.5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </StepFrame>
          )}

          {/* Step 2: Province */}
          {step === 2 && (
            <StepFrame
              icon={<MapPin className="h-5 w-5" />}
              title="Where are you closing deals?"
              subtitle="We promise this is relevant — your tax rates, GST/HST, and provincial rules all depend on this."
            >
              <div className="grid gap-3">
                <Label className="text-white/80">Province / Territory</Label>
                <Select
                  value={province}
                  onValueChange={(v) => setProvince(v as Province)}
                >
                  <SelectTrigger className="border-white/20 bg-white/5 text-white focus:ring-white/30">
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
                <p className="text-xs text-white/35">
                  We cover all 13 provinces and territories. Your tax
                  calculations depend on this.
                </p>
              </div>
            </StepFrame>
          )}

          {/* Step 3: About You */}
          {step === 3 && (
            <StepFrame
              icon={<User className="h-5 w-5" />}
              title="Tell us who we're building this for."
              subtitle="These details appear on your reports and personalize your experience. No aliases, please — unless that's on your business card."
            >
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label className="text-white/80">Your name</Label>
                  <Input
                    placeholder="e.g. Jordan MacLeod"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="border-white/20 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-white/30"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-white/80">Your brokerage</Label>
                  <Input
                    placeholder="e.g. Royal LePage, RE/MAX, Century 21..."
                    value={brokerageName}
                    onChange={(e) => setBrokerageName(e.target.value)}
                    className="border-white/20 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-white/30"
                  />
                  <p className="text-xs text-white/35">
                    Your work family. For better or for worse.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label className="text-white/80">Your phone number</Label>
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(506) 555-0100"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="border-white/20 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-white/30"
                  />
                  <p className="text-xs text-white/35">
                    Used on your Open House sign-in page and anywhere else clients need to reach you.
                  </p>
                </div>
              </div>
            </StepFrame>
          )}

          {/* Step 4: Business Structure */}
          {step === 4 && (
            <StepFrame
              icon={<Building2 className="h-5 w-5" />}
              title="How's your business set up?"
              subtitle="Still with us? Good — this one matters. Your business structure shapes your tax picture, expense categories, and how we model your take-home pay."
            >
              <div className="grid gap-5">
                {/* Business structure */}
                <div className="grid gap-2">
                  <Label className="text-white/80">Business structure</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "no",      label: "Sole Proprietor" },
                      { value: "prec",    label: "PREC" },
                      { value: "general", label: "Corporation" },
                    ].map(({ value, label }) => {
                      const active =
                        value === "no"
                          ? !isIncorporated
                          : isIncorporated && corpType === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            if (value === "no") {
                              setIsIncorporated(false);
                            } else {
                              setIsIncorporated(true);
                              setCorpType(value as "prec" | "general");
                            }
                          }}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                            active
                              ? "border-white/40 bg-white/15 text-white"
                              : "border-white/10 bg-white/5 text-white/50 hover:text-white/80",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {isIncorporated && (
                    <p className="text-xs text-white/35">
                      PREC = Personal Real Estate Corporation, available in most provinces.
                      Choose &ldquo;Corporation&rdquo; for a general or numbered company.
                    </p>
                  )}
                </div>

                {/* Compensation method — only when incorporated */}
                {isIncorporated && (
                  <div className="grid gap-2">
                    <Label className="text-white/80">How do you pay yourself?</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: "salary",    label: "Salary" },
                        { value: "dividends", label: "Dividends" },
                        { value: "mixed",     label: "Both" },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setCompensationMethod(value as "salary" | "dividends" | "mixed")}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                            compensationMethod === value
                              ? "border-white/40 bg-white/15 text-white"
                              : "border-white/10 bg-white/5 text-white/50 hover:text-white/80",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-white/35">
                      Salary generates CPP + RRSP room; dividends don&apos;t.
                      Mixed is common for PREC owners.
                    </p>
                  </div>
                )}

                {/* Staff on payroll */}
                <div className="grid gap-2">
                  <Label className="text-white/80">Do you have staff on payroll?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {([false, true] as const).map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setHasEmployees(val)}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                          hasEmployees === val
                            ? "border-white/40 bg-white/15 text-white"
                            : "border-white/10 bg-white/5 text-white/50 hover:text-white/80",
                        )}
                      >
                        {val ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                  {hasEmployees && (
                    <Input
                      type="number"
                      min="1"
                      placeholder="Number of employees (optional)"
                      value={numEmployees}
                      onChange={(e) => setNumEmployees(e.target.value)}
                      className="border-white/20 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-white/30"
                    />
                  )}
                </div>

                {/* GST/HST Filing Frequency */}
                <div className="grid gap-2">
                  <Label className="text-white/80">How often do you file GST/HST?</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "quarterly", label: "Quarterly" },
                      { value: "monthly",   label: "Monthly" },
                      { value: "annual",    label: "Annual" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFilingFrequency(value as "monthly" | "quarterly" | "annual")}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                          filingFrequency === value
                            ? "border-white/40 bg-white/15 text-white"
                            : "border-white/10 bg-white/5 text-white/50 hover:text-white/80",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-white/35">
                    Most agents file quarterly. This determines how your expenses
                    are grouped for filing periods and deadline reminders.
                  </p>
                </div>
              </div>
            </StepFrame>
          )}

          {/* Step 5: The Money Math */}
          {step === 5 && (
            <StepFrame
              icon={<DollarSign className="h-5 w-5" />}
              title="Let's talk about how you get paid."
              subtitle="This is the big one — yes, we're asking a lot. (And what gets taken away.) Your splits, fees, and cash position power every projection we build for you."
            >
              <div className="grid gap-5">
                {/* Split selector */}
                <div className="grid gap-2">
                  <Label className="text-white/80">
                    Commission Split — Agent / Brokerage
                  </Label>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {SPLIT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSplitPreset(opt.value)}
                        className={cn(
                          "rounded-lg border py-2.5 text-[12px] font-bold transition-all",
                          splitPreset === opt.value
                            ? "border-primary bg-primary text-white shadow-md"
                            : "border-white/20 bg-white/5 text-white/60 hover:border-white/40 hover:text-white",
                        )}
                      >
                        {opt.agentPct}
                      </button>
                    ))}
                  </div>
                  {/* Visual split bar */}
                  <div className="mt-0.5 flex h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-primary transition-all duration-300"
                      style={{ width: `${agentPct}%` }}
                    />
                    <div
                      className="bg-white/20 transition-all duration-300"
                      style={{ width: `${brokeragePct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-white/40">
                    <span>You keep: {agentPct}%</span>
                    <span>Brokerage gets: {brokeragePct}%</span>
                  </div>
                </div>

                {/* Monthly fee */}
                <div className="grid gap-2">
                  <Label className="text-white/80">Monthly Brokerage Fee</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">
                      $
                    </span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={monthlyFee}
                      onChange={(e) => setMonthlyFee(e.target.value)}
                      className="border-white/20 bg-white/5 pl-6 text-white placeholder:text-white/30"
                    />
                  </div>
                  <p className="text-xs text-white/35">
                    The monthly tribute to the mothership — desk fees, tech
                    fees, etc.
                  </p>
                </div>

                {/* Transaction fees */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label className="text-[12px] text-white/80">
                      Tx Fee Rate (%)
                    </Label>
                    <Input
                      type="number"
                      placeholder="e.g. 2"
                      value={txFeeRate}
                      onChange={(e) => setTxFeeRate(e.target.value)}
                      className="border-white/20 bg-white/5 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[12px] text-white/80">
                      Annual Cap ($)
                    </Label>
                    <Input
                      type="number"
                      placeholder="e.g. 2500"
                      value={txFeeCap}
                      onChange={(e) => setTxFeeCap(e.target.value)}
                      className="border-white/20 bg-white/5 text-white placeholder:text-white/30"
                    />
                  </div>
                </div>
                <p className="text-xs text-white/35">
                  Transaction fees are optional. Leave blank if your brokerage
                  doesn&apos;t charge per deal.
                </p>

                {/* Cash Reserve */}
                <div className="grid gap-2">
                  <Label className="text-white/80">Current Cash Reserve</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">
                      $
                    </span>
                    <Input
                      type="number"
                      placeholder="e.g. 30000"
                      value={cashReserve}
                      onChange={(e) => setCashReserve(e.target.value)}
                      className="border-white/20 bg-white/5 pl-6 text-white placeholder:text-white/30"
                    />
                  </div>
                  <p className="text-xs text-white/35">
                    How much business cash do you have on hand right now? Powers your Survival Runway calculation.
                  </p>
                </div>

                {/* HST Withholding */}
                <div className="grid gap-2">
                  <Label className="text-white/80">Does your brokerage withhold HST from your commission cheques?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setBrokerageWithholdsHst(false)}
                      className={cn(
                        "rounded-lg border py-2.5 text-sm font-medium transition-all",
                        !brokerageWithholdsHst
                          ? "border-primary bg-primary text-white shadow-md"
                          : "border-white/20 bg-white/5 text-white/60 hover:border-white/40 hover:text-white",
                      )}
                    >
                      No — I get the full amount
                    </button>
                    <button
                      onClick={() => setBrokerageWithholdsHst(true)}
                      className={cn(
                        "rounded-lg border py-2.5 text-sm font-medium transition-all",
                        brokerageWithholdsHst
                          ? "border-primary bg-primary text-white shadow-md"
                          : "border-white/20 bg-white/5 text-white/60 hover:border-white/40 hover:text-white",
                      )}
                    >
                      Yes — they hold it for me
                    </button>
                  </div>
                  <p className="text-xs text-white/35">
                    Some brokerages withhold the HST portion and remit it to CRA on your behalf. This changes how we calculate your take-home pay and what you need to set aside.
                    {brokerageWithholdsHst && " Nice — one less thing to worry about."}
                  </p>
                </div>
              </div>
            </StepFrame>
          )}

          {/* Step 6: Experience */}
          {step === 6 && (
            <StepFrame
              icon={<Clock className="h-5 w-5" />}
              title="How long have you been in the game?"
              subtitle="Almost done — we promise. This calibrates your benchmarks so we compare you to agents at your level, not the entire industry."
            >
              <div className="grid grid-cols-2 gap-3">
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.range}
                    onClick={() => {
                      setExperienceRange(opt.range);
                      setExperienceYears(opt.years);
                    }}
                    className={cn(
                      "flex flex-col rounded-xl border p-4 text-left transition-all",
                      experienceRange === opt.range
                        ? "border-primary bg-primary/15 shadow-inner"
                        : "border-white/20 bg-white/5 hover:border-white/40",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[13px] font-semibold",
                        experienceRange === opt.range
                          ? "text-primary"
                          : "text-white/90",
                      )}
                    >
                      {opt.label}
                    </span>
                    <span className="mt-0.5 text-[11px] font-medium text-white/50">
                      {opt.range_label}
                    </span>
                    <span className="mt-2 text-[11px] leading-relaxed text-white/35">
                      {opt.subtitle}
                    </span>
                    {experienceRange === opt.range && (
                      <Check className="mt-2 h-3.5 w-3.5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </StepFrame>
          )}

          {/* Step 7: Color Theme */}
          {step === 7 && (
            <StepFrame
              icon={<Palette className="h-5 w-5" />}
              title="Choose your battle colour."
              subtitle="OK — you've earned a fun one. This sets the accent colour across your dashboard. Zero financial implications. Just vibes."
            >
              <div className="grid gap-2.5">
                {COLOR_THEMES.map((theme) => (
                  <button
                    key={theme.value}
                    onClick={() => setColorTheme(theme.value)}
                    className={cn(
                      "flex items-center gap-4 rounded-xl border p-3.5 text-left transition-all",
                      colorTheme === theme.value
                        ? "border-white/40 bg-white/10"
                        : "border-white/15 bg-white/5 hover:border-white/30",
                    )}
                  >
                    {/* Colour swatch */}
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-md"
                      style={{ background: theme.bg }}
                    >
                      {colorTheme === theme.value && (
                        <Check className="h-4 w-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          "text-[13px] font-semibold",
                          colorTheme === theme.value
                            ? "text-white"
                            : "text-white/80",
                        )}
                      >
                        {theme.label}
                      </div>
                      <div className="text-[11px] text-white/40">
                        {theme.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </StepFrame>
          )}

          {/* Step 8: Goals (optional) */}
          {step === 8 && (
            <StepFrame
              icon={<Target className="h-5 w-5" />}
              title="Last one — set your targets for this year."
              subtitle="You made it. We've suggested a starting goal based on your experience level — adjust it if you're feeling ambitious (or realistic). You can always change this later."
            >
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label className="text-white/80">Annual GCI Goal <span className="text-white/35 font-normal text-[11px]">(suggested based on your experience)</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">
                      $
                    </span>
                    <Input
                      type="number"
                      placeholder="e.g. 150,000"
                      value={goalGCI}
                      onChange={(e) => setGoalGCI(e.target.value)}
                      className="border-white/20 bg-white/5 pl-6 text-white placeholder:text-white/30"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-white/80">Transaction Goal (total deals)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 20"
                    value={goalTx}
                    onChange={(e) => setGoalTx(e.target.value)}
                    className="border-white/20 bg-white/5 text-white placeholder:text-white/30"
                  />
                  <p className="text-xs text-white/35">
                    Buyers + sellers combined. You can break this down by side in Settings.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label className="text-white/80">Sales Volume Goal</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">
                      $
                    </span>
                    <Input
                      type="number"
                      placeholder="e.g. 12,000,000"
                      value={goalVolume}
                      onChange={(e) => setGoalVolume(e.target.value)}
                      className="border-white/20 bg-white/5 pl-6 text-white placeholder:text-white/30"
                    />
                  </div>
                </div>
                <p className="text-xs text-white/35">
                  These power your pace tracking and goal progress on the dashboard. You can update them anytime in Settings.
                </p>
              </div>
            </StepFrame>
          )}

          {/* Step 9: Done */}
          {step === TOTAL_STEPS - 1 && (
            <DoneStep
              displayName={displayName}
              province={province}
              splitPreset={splitPreset}
              colorTheme={colorTheme}
              saving={saving}
              onFinish={handleFinish}
              termsAccepted={termsAccepted}
              onTermsChange={setTermsAccepted}
            />
          )}

          {/* Nav buttons — steps 1–8 */}
          {step > 0 && step < TOTAL_STEPS - 1 && (
            <div className="mt-7 border-t border-white/10 pt-5">
              {/* Step 8: stack buttons vertically on narrow screens */}
              {step === 8 ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="ghost"
                    onClick={back}
                    className="text-white/50 hover:bg-white/10 hover:text-white order-3 sm:order-1"
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center order-1 sm:order-2">
                    <Button
                      variant="ghost"
                      onClick={() => setStep(TOTAL_STEPS - 1)}
                      className="text-white/40 hover:text-white/70 text-sm"
                    >
                      Use suggested
                    </Button>
                    <Button
                      onClick={() => setStep(TOTAL_STEPS - 1)}
                      style={{ background: selectedTheme.bg }}
                      className="gap-2 text-white shadow-lg hover:opacity-90 transition-opacity w-full sm:w-auto"
                    >
                      Lock in Goals
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    onClick={back}
                    className="text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={advance}
                    style={{ background: selectedTheme.bg }}
                    className="gap-2 text-white shadow-lg hover:opacity-90 transition-opacity"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legal footer */}
      <p className="mt-6 text-center text-[10px] text-white/20">
        Agent Runway · Canadian Real Estate Analytics · All calculations are
        estimates only.
      </p>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="ob-bg"
          x1="20"
          y1="0"
          x2="20"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#1e2f5e" />
          <stop offset="100%" stopColor="#0d1526" />
        </linearGradient>
        <linearGradient
          id="ob-left"
          x1="3"
          y1="9"
          x2="16"
          y2="31"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#6cb4ff" />
          <stop offset="55%" stopColor="#2e7be6" />
          <stop offset="100%" stopColor="#1452a8" />
        </linearGradient>
        <linearGradient
          id="ob-right"
          x1="37"
          y1="9"
          x2="24"
          y2="31"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#6cb4ff" />
          <stop offset="55%" stopColor="#2e7be6" />
          <stop offset="100%" stopColor="#1452a8" />
        </linearGradient>
        <linearGradient
          id="ob-sheen"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ob-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F97316" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="40" height="40" rx="9" fill="url(#ob-bg)" />
      <path d="M3 9 L17.5 9 L14.5 31 L3 31 Z" fill="url(#ob-left)" />
      <path d="M3 9 L17.5 9 L17 13 L3 12.5 Z" fill="url(#ob-sheen)" />
      <path d="M22.5 9 L37 9 L37 31 L25.5 31 Z" fill="url(#ob-right)" />
      <path d="M22.5 9 L37 9 L37 13.5 L23 13 Z" fill="url(#ob-sheen)" />
      <rect x="15" y="9" width="10" height="22" fill="#0a1020" fillOpacity="0.5" />
      <circle cx="20" cy="14" r="5" fill="url(#ob-glow)" />
      <circle cx="20" cy="14" r="1.8" fill="#F97316" />
    </svg>
  );
}

function WelcomeStep({ onContinue, teamInfo }: { onContinue: () => void; teamInfo: { orgName: string; leaderName: string } | null }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <LogoMark size={60} />
      <div>
        <h1 className="text-2xl font-bold text-white">
          {teamInfo
            ? <>Welcome to {teamInfo.orgName}.</>
            : <>Welcome to Agent Runway.</>}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/55">
          {teamInfo ? (
            <>
              {teamInfo.leaderName} invited you to join {teamInfo.orgName} on Agent Runway.
              We&apos;re about to ask you a bunch of questions. We know — but the more you tell us now, the less we have to guess later.
            </>
          ) : (
            <>
              Your business analytics platform built for Canadian real estate agents.
              We&apos;re about to ask you a bunch of questions. We know — but the more you tell us now, the less we have to guess later.
            </>
          )}
        </p>
      </div>

      {/* Team context banner */}
      {teamInfo && (
        <div className="w-full max-w-xs rounded-lg border border-white/10 bg-white/5 p-3 text-left">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-orange-400 shrink-0" />
            <span className="text-[12px] font-semibold text-white/80">Joining as a team member</span>
          </div>
          <ul className="space-y-1 text-[11px] text-white/50">
            <li>• Your leader can see your GCI and pipeline summary</li>
            <li>• Your expenses, taxes, splits, and client details stay private</li>
            <li>• You can leave the team at any time from Settings</li>
          </ul>
        </div>
      )}

      {/* Feature bullets */}
      <div className="flex w-full max-w-xs flex-col gap-2">
        {[
          { color: "bg-emerald-400", text: "Tax estimates tailored to your province (informational only)" },
          { color: "bg-blue-400", text: "Projections based on your actual split & fees" },
          { color: "bg-violet-400", text: "Runway score, pipeline health, business insights" },
        ].map((item) => (
          <div
            key={item.text}
            className="flex items-center gap-3 rounded-lg bg-white/5 p-3 text-left"
          >
            <div className={cn("h-2 w-2 shrink-0 rounded-full", item.color)} />
            <span className="text-[12px] text-white/60">{item.text}</span>
          </div>
        ))}
      </div>

      <Button
        onClick={onContinue}
        size="lg"
        className="mt-2 w-full max-w-xs gap-2 bg-primary text-white shadow-lg hover:bg-primary/90"
      >
        Let&apos;s Get Started
        <ArrowRight className="h-4 w-4" />
      </Button>

      <p className="text-[11px] text-white/25">
        8 quick steps. About 2 minutes. No credit card.
      </p>
    </div>
  );
}

function StepFrame({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-white/50">
            {subtitle}
          </p>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function DoneStep({
  displayName,
  province,
  splitPreset,
  colorTheme,
  saving,
  onFinish,
  termsAccepted,
  onTermsChange,
}: {
  displayName: string;
  province: Province;
  splitPreset: SplitPreset;
  colorTheme: string;
  saving: boolean;
  onFinish: () => void;
  termsAccepted: boolean;
  onTermsChange: (v: boolean) => void;
}) {
  const agentPct = parseInt(splitPreset.match(/p(\d+)/)?.[1] ?? "80");
  const theme = COLOR_THEMES.find((t) => t.value === colorTheme) ?? COLOR_THEMES[0];
  const provinceLabel = PROVINCE_LABELS[province];
  const firstName = displayName.trim().split(" ")[0] || null;

  return (
    <div className="flex flex-col items-center gap-6 py-2 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
        <Rocket className="h-7 w-7" />
      </div>

      <div>
        <h2 className="text-xl font-bold text-white">
          {firstName
            ? `You're cleared for takeoff, ${firstName}.`
            : "You're cleared for takeoff."}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          Your account is configured and ready. The runway is yours.
        </p>
      </div>

      {/* Summary card */}
      <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/30">
          Your Setup
        </p>
        <div className="space-y-2.5">
          <SummaryRow label="Province" value={provinceLabel} />
          <SummaryRow
            label="Commission Split"
            value={`${agentPct}% you / ${100 - agentPct}% brokerage`}
          />
          <SummaryRow label="Colour Theme" value={theme.label} dot={theme.bg} />
        </div>
      </div>

      {/* Terms acceptance */}
      <label className="flex w-full cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => onTermsChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span className="text-[12px] leading-relaxed text-white/50">
          I have read and agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            Privacy Policy
          </a>
          , including the disclaimer that Agent Runway outputs are not financial or tax advice.
        </span>
      </label>

      <p className="text-[11px] leading-relaxed text-white/30 text-center px-2">
        By creating an account, you acknowledge that your data may be processed
        by service providers located in the United States. See our{" "}
        <a href="/subprocessors" target="_blank" rel="noopener noreferrer" className="text-white/40 underline hover:text-white/60 transition-colors">
          Sub-Processors list
        </a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-white/40 underline hover:text-white/60 transition-colors">
          Privacy Policy
        </a>{" "}
        for details.
      </p>

      <Button
        onClick={onFinish}
        disabled={saving || !termsAccepted}
        size="lg"
        className="w-full gap-2 bg-primary text-white shadow-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? "Saving your settings..." : "Go to Dashboard"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  dot,
}: {
  label: string;
  value: string;
  dot?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-white/40">{label}</span>
      <div className="flex items-center gap-1.5">
        {dot && (
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: dot }}
          />
        )}
        <span className="text-[12px] font-semibold text-white/80">{value}</span>
      </div>
    </div>
  );
}
