"use client";

import { useState, useEffect } from "react";
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
import { Check, Sparkles, ExternalLink, Loader2, Car, Landmark, RefreshCw, Trash2, Clock, Info, AlertCircle, XCircle, Building2, User, TrendingDown, Home, Mail } from "lucide-react";
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
import { useRouter, useSearchParams } from "next/navigation";
import { PlaidLinkButton } from "@/components/plaid-link";
import {
  PROVINCE_LABELS,
  type Province,
  type SplitPreset,
  type UserSettings,
  type PlaidItem,
  type CommunicationProfile,
  type BusinessIdentity,
  type AgentGoals,
} from "@/lib/types/database";
import {
  CREA_BOARDS,
  boardsForProvinceEnum,
  type CreaBoard,
} from "@/lib/crea-board";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { VoiceQuizModal } from "./voice-quiz-modal";
import { cn } from "@/lib/utils";

type GoogleConnection = {
  id: string;
  email_address: string;
  display_name: string | null;
  gmail_send_enabled: boolean;
  calendar_sync_enabled: boolean;
  drive_read_enabled: boolean;
  connected_at: string;
} | null;

interface Props {
  settings: UserSettings;
  plaidItems?: PlaidItem[];
  plaidConfigured?: boolean;
  googleConnection?: GoogleConnection;
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

export function SettingsContent({ settings, plaidItems: initialPlaidItems = [], plaidConfigured = false, googleConnection = null }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [googleConn, setGoogleConn] = useState<GoogleConnection>(googleConnection);
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false);

  useEffect(() => {
    if (searchParams.get("google_connected") === "true") {
      toast.success("Google account connected successfully!");
      router.replace("/settings");
    }
  }, [searchParams, router]);

  async function handleGoogleDisconnect() {
    setGoogleDisconnecting(true);
    try {
      const res = await fetch("/api/auth/google/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
      setGoogleConn(null);
      toast.success("Google account disconnected.");
    } catch {
      toast.error("Could not disconnect. Please try again.");
    } finally {
      setGoogleDisconnecting(false);
    }
  }

  // ── Section AI: AI Voice Profile ─────────────────────────────────────────
  const [voiceQuizOpen, setVoiceQuizOpen] = useState(false);
  const [communicationProfile, setCommunicationProfile] = useState<CommunicationProfile | null>(
    settings.communication_profile ?? null,
  );
  const [businessIdentity, setBusinessIdentity] = useState<BusinessIdentity>(() => {
    const b = settings.business_identity;
    return {
      completed: b?.completed ?? false,
      specialty: b?.specialty ?? [],
      market_type: b?.market_type ?? [],
      business_model: b?.business_model ?? "",
      lead_sources: b?.lead_sources ?? [],
      years_experience: b?.years_experience ?? "",
      avg_price_range: b?.avg_price_range ?? "",
    };
  });
  const [agentGoals, setAgentGoals] = useState<AgentGoals>(() => {
    const g = settings.agent_goals;
    return {
      completed: g?.completed ?? false,
      primary_goal: g?.primary_goal ?? "",
      secondary_goals: g?.secondary_goals ?? [],
      signature_phrases: g?.signature_phrases ?? "",
      hard_nogos: g?.hard_nogos ?? "",
      suppressed_topics: g?.suppressed_topics ?? [],
    };
  });
  const [savingAiProfile, setSavingAiProfile] = useState(false);
  const aiProfileSaved = useSaved();

  async function saveVoiceProfile(profile: CommunicationProfile) {
    const supabase = createClient();
    const { error } = await supabase
      .from("user_settings")
      .update({
        communication_profile: profile as unknown as Record<string, unknown>,
        ai_voice_guide: profile.ai_voice_summary,
      })
      .eq("user_id", settings.user_id);
    if (error) {
      toast.error("Failed to save voice profile — please try again.");
      return;
    }
    setCommunicationProfile(profile);
    router.refresh();
  }

  async function saveAiProfile() {
    setSavingAiProfile(true);
    const updatedBiz: BusinessIdentity = {
      ...businessIdentity,
      completed: !!(
        businessIdentity.specialty.length > 0 &&
        businessIdentity.market_type.length > 0 &&
        businessIdentity.business_model
      ),
    };
    const updatedGoals: AgentGoals = {
      ...agentGoals,
      completed: !!(agentGoals.primary_goal || agentGoals.signature_phrases || agentGoals.hard_nogos),
    };
    const supabase = createClient();
    const { error } = await supabase
      .from("user_settings")
      .update({
        business_identity: updatedBiz as unknown as Record<string, unknown>,
        agent_goals: updatedGoals as unknown as Record<string, unknown>,
      })
      .eq("user_id", settings.user_id);
    setSavingAiProfile(false);
    if (error) { toast.error("Failed to save AI profile — please try again."); return; }
    setBusinessIdentity(updatedBiz);
    setAgentGoals(updatedGoals);
    aiProfileSaved.flash();
    toast.success("AI profile saved ✓");
    router.refresh();
  }

  function toggleMulti<T extends string>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
  }

  // ── Section 1: Province ──────────────────────────────────────────────────
  const [province, setProvince] = useState<Province>(settings.province);

  // ── Section 1c: CREA Board ───────────────────────────────────────────────
  const [boardCode, setBoardCode] = useState<string>(settings.board_code ?? "");
  const [boardSubregion, setBoardSubregion] = useState<string>(settings.board_subregion ?? "");
  const [savingBoard, setSavingBoard] = useState(false);
  const boardSaved = useSaved();

  const availableBoards: CreaBoard[] = boardsForProvinceEnum(province);
  const selectedBoard = CREA_BOARDS.find((b) => b.slug === boardCode) ?? null;

  async function saveBoard() {
    setSavingBoard(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingBoard(false); return; }
    const { error } = await supabase.from("user_settings").update({ board_code: boardCode, board_subregion: boardSubregion }).eq("user_id", user.id);
    setSavingBoard(false);
    if (error) {
      console.error("[saveBoard] Supabase error:", error.code, error.message);
      const hint = error.code === "42703"
        ? "Database migration missing — run migration 00031 in the Supabase SQL Editor."
        : error.message;
      toast.error("Failed to save board", { description: hint });
      return;
    }
    boardSaved.flash();
    router.refresh();
  }
  const [savingProvince, setSavingProvince] = useState(false);
  const provinceSaved = useSaved();

  async function saveProvince() {
    setSavingProvince(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("user_settings")
      .update({ province })
      .eq("user_id", settings.user_id);
    setSavingProvince(false);
    if (error) { toast.error("Failed to save province — please try again."); return; }
    provinceSaved.flash();
    toast.success("Province updated ✓");
  }

  // ── Section 1b: Business Structure ──────────────────────────────────────
  const [isIncorporated, setIsIncorporated] = useState(settings.is_incorporated ?? false);
  const [corpType, setCorpType] = useState<"prec" | "general">(
    (settings.corp_type as "prec" | "general") ?? "prec",
  );
  const [compensationMethod, setCompMethod] = useState<"salary" | "dividends" | "mixed">(
    (settings.compensation_method as "salary" | "dividends" | "mixed") ?? "salary",
  );
  const [hasEmployees, setHasEmployees] = useState(settings.has_employees ?? false);
  const [numEmployees, setNumEmployees] = useState(String(settings.num_employees ?? 0));
  const [savingBiz, setSavingBiz] = useState(false);
  const bizSaved = useSaved();

  async function saveBiz() {
    setSavingBiz(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("user_settings")
      .update({
        is_incorporated: isIncorporated,
        corp_type: isIncorporated ? corpType : null,
        compensation_method: isIncorporated ? compensationMethod : "salary",
        has_employees: hasEmployees,
        num_employees: hasEmployees ? parseInt(numEmployees) || 0 : 0,
      })
      .eq("user_id", settings.user_id);
    setSavingBiz(false);
    if (error) { toast.error("Failed to save business structure — please try again."); return; }
    bizSaved.flash();
    toast.success("Business structure saved ✓");
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
    const { error } = await supabase
      .from("user_settings")
      .update({ split_preset: splitPreset })
      .eq("user_id", settings.user_id);
    setSavingSplit(false);
    if (error) { toast.error("Failed to save commission split — please try again."); return; }
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
    const { error } = await supabase
      .from("user_settings")
      .update({
        monthly_brokerage_fee: parseFloat(monthlyFee) || 0,
        tx_fee_rate_pct: (parseFloat(txFeeRate) || 0) / 100,
        tx_fee_annual_cap: parseFloat(txFeeCap) || 0,
      })
      .eq("user_id", settings.user_id);
    setSavingFees(false);
    if (error) { toast.error("Failed to save brokerage fees — please try again."); return; }
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

  // ── Section 7: Claiming (Home Office + Vehicle) ──────────────────────────
  const [vehiclePct, setVehiclePct] = useState<string>(
    settings.vehicle_business_use_pct != null
      ? String(Math.round(Number(settings.vehicle_business_use_pct) * 100))
      : "0",
  );
  const [savingClaiming, setSavingClaiming] = useState(false);
  const claimingSaved = useSaved();

  async function saveClaiming() {
    const vPct = Math.min(100, Math.max(0, parseFloat(vehiclePct)    || 0)) / 100;
    const hPct = Math.min(100, Math.max(0, parseFloat(homeOfficePct) || 0)) / 100;
    setSavingClaiming(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("user_settings")
      .update({
        vehicle_business_use_pct:    vPct,
        home_office_business_use_pct: hPct,
      })
      .eq("user_id", settings.user_id);
    setSavingClaiming(false);
    if (error) { toast.error("Failed to save claiming percentages — please try again."); return; }
    claimingSaved.flash();
    toast.success("Claiming percentages saved ✓");
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
        router.refresh();
      } else {
        toast.error("Sync failed — please try again.");
      }
    } catch {
      toast.error("Network error — please check your connection.");
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDisconnect(itemId: string) {
    const prevItems = plaidItems;
    setPlaidItems((prev) => prev.filter((i) => i.id !== itemId));
    try {
      const res = await fetch("/api/plaid/disconnect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      if (!res.ok) {
        setPlaidItems(prevItems);
        toast.error("Failed to disconnect bank account — please try again.");
      }
    } catch {
      setPlaidItems(prevItems);
      toast.error("Network error — please check your connection.");
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

  // ── Section P: Profile Identity ─────────────────────────────────────────
  const [displayName,   setDisplayName]   = useState(settings.display_name ?? "");
  const [brokerageName, setBrokerageName] = useState(settings.brokerage_name ?? "");
  const [businessName,  setBusinessName]  = useState(settings.business_name ?? "");
  const [socialInstagram, setSocialInstagram] = useState(settings.social_instagram ?? "");
  const [socialFacebook,  setSocialFacebook]  = useState(settings.social_facebook  ?? "");
  const [socialLinkedin,  setSocialLinkedin]  = useState(settings.social_linkedin  ?? "");
  const [socialTiktok,    setSocialTiktok]    = useState(settings.social_tiktok    ?? "");
  const [socialYoutube,   setSocialYoutube]   = useState(settings.social_youtube   ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const profileSaved = useSaved();

  async function saveProfile() {
    setSavingProfile(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("user_settings")
      .update({
        display_name:      displayName,
        brokerage_name:    brokerageName,
        business_name:     businessName,
        social_instagram:  socialInstagram,
        social_facebook:   socialFacebook,
        social_linkedin:   socialLinkedin,
        social_tiktok:     socialTiktok,
        social_youtube:    socialYoutube,
      })
      .eq("user_id", settings.user_id);
    setSavingProfile(false);
    if (error) { toast.error("Failed to save profile — please try again."); return; }
    profileSaved.flash();
    toast.success("Profile saved ✓");
    router.refresh();
  }

  // ── Section PC: Post-Cap Split ───────────────────────────────────────────
  const [postCapThreshold,   setPostCapThreshold]   = useState(String(settings.post_cap_threshold_gci ?? 0));
  const [postCapAgentPct,    setPostCapAgentPct]    = useState(
    settings.post_cap_agent_pct > 0
      ? String(Math.round(Number(settings.post_cap_agent_pct) * 100))
      : ""
  );
  const [postCapBrokeragePct, setPostCapBrokeragePct] = useState(
    settings.post_cap_brokerage_pct > 0
      ? String(Math.round(Number(settings.post_cap_brokerage_pct) * 100))
      : ""
  );
  const [savingPostCap, setSavingPostCap] = useState(false);
  const postCapSaved = useSaved();

  async function savePostCap() {
    setSavingPostCap(true);
    const supabase = createClient();
    const threshold = parseFloat(postCapThreshold) || 0;
    const agentPct  = (parseFloat(postCapAgentPct)    || 0) / 100;
    const brokPct   = (parseFloat(postCapBrokeragePct) || 0) / 100;
    const { error } = await supabase
      .from("user_settings")
      .update({
        post_cap_threshold_gci:   threshold,
        post_cap_agent_pct:       agentPct,
        post_cap_brokerage_pct:   brokPct,
      })
      .eq("user_id", settings.user_id);
    setSavingPostCap(false);
    if (error) { toast.error("Failed to save post-cap split — please try again."); return; }
    postCapSaved.flash();
    toast.success("Post-cap split saved ✓");
  }

  // ── Section HO: Home Office % (state only — saved together with vehicle via saveClaiming) ──
  const [homeOfficePct, setHomeOfficePct] = useState<string>(
    settings.home_office_business_use_pct != null
      ? String(Math.round(Number(settings.home_office_business_use_pct) * 100))
      : "0",
  );

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
    const { error } = await supabase
      .from("user_settings")
      .update({ goal_gci: parseFloat(goalGCI) || 0 })
      .eq("user_id", settings.user_id);
    setSavingGoal(false);
    if (error) { toast.error("Failed to save annual goal — please try again."); return; }
    goalSaved.flash();
    toast.success("Annual goal updated ✓");
  }

  async function saveRunway() {
    setSavingRunway(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("user_settings")
      .update({
        cash_reserve: parseFloat(cashReserve) || 0,
        experience_years: experienceYears
          ? parseInt(experienceYears) || null
          : null,
      })
      .eq("user_id", settings.user_id);
    setSavingRunway(false);
    if (error) { toast.error("Failed to save cash reserve — please try again."); return; }
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

      {/* Card AI — Your AI Voice */}
      <div id="ai-voice">
        <VoiceQuizModal
          open={voiceQuizOpen}
          onOpenChange={setVoiceQuizOpen}
          onSave={saveVoiceProfile}
          existingProfile={communicationProfile}
        />
        <Card className="rounded-2xl shadow-sm overflow-hidden" style={{ border: "1.5px solid transparent", backgroundImage: "linear-gradient(var(--card), var(--card)), linear-gradient(135deg, #7c3aed, #f59e0b)", backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box" }}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <CardTitle>Your AI Voice</CardTitle>
              </div>
              {/* Completion indicator */}
              <div className="flex items-center gap-2">
                {[communicationProfile?.completed, businessIdentity.completed || (businessIdentity.specialty.length > 0 && !!businessIdentity.business_model), agentGoals.completed || !!(agentGoals.signature_phrases || agentGoals.hard_nogos)].filter(Boolean).length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {[communicationProfile?.completed, businessIdentity.completed || (businessIdentity.specialty.length > 0 && !!businessIdentity.business_model), agentGoals.completed || !!(agentGoals.signature_phrases || agentGoals.hard_nogos)].filter(Boolean).length} of 3 complete
                  </span>
                )}
              </div>
            </div>
            <CardDescription>
              Help your AI communicate exactly like you do — your tone, your style, your rules.
            </CardDescription>
            {/* Completion progress bar */}
            {(() => {
              const count = [
                communicationProfile?.completed,
                businessIdentity.completed || (businessIdentity.specialty.length > 0 && !!businessIdentity.business_model),
                agentGoals.completed || !!(agentGoals.signature_phrases || agentGoals.hard_nogos),
              ].filter(Boolean).length;
              return count > 0 ? (
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-amber-400 transition-all duration-500"
                    style={{ width: `${(count / 3) * 100}%` }}
                  />
                </div>
              ) : null;
            })()}
          </CardHeader>
          <CardContent className="grid gap-6">

            {/* Part A — Voice & Personality Quiz */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Voice & Personality</span>
                {communicationProfile?.completed && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium">
                    <Check className="h-3 w-3" /> Complete
                  </span>
                )}
              </div>

              {communicationProfile?.completed ? (
                <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                  {/* Trait badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      ...(communicationProfile.derived.voice_traits ?? []),
                      ...(communicationProfile.derived.archetype ?? []),
                    ].slice(0, 5).map((trait) => (
                      <Badge key={trait} variant="secondary" className="text-xs capitalize">
                        {trait.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                  {/* AI voice summary */}
                  <blockquote className="border-l-4 border-violet-400 pl-3 text-xs text-muted-foreground italic leading-relaxed">
                    {communicationProfile.ai_voice_summary}
                  </blockquote>
                  <button
                    type="button"
                    onClick={() => setVoiceQuizOpen(true)}
                    className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 underline-offset-2 hover:underline"
                  >
                    Retake quiz
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-violet-300 dark:border-violet-700 bg-violet-50/40 dark:bg-violet-950/20 p-5 space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    Your AI doesn&apos;t know how you talk yet.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setVoiceQuizOpen(true)}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    Take the 3-minute quiz →
                  </Button>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Part B — Business Identity */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What kind of agent are you?</p>

              {/* Specialty */}
              <div className="space-y-2">
                <Label className="text-sm">Specialty</Label>
                <div className="flex flex-wrap gap-2">
                  {(["buyer", "listing", "both"] as const).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBusinessIdentity((b) => ({ ...b, specialty: toggleMulti(b.specialty, val) }))}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        businessIdentity.specialty.includes(val)
                          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 font-medium"
                          : "border-border bg-card text-muted-foreground hover:border-violet-400",
                      )}
                    >
                      {val === "buyer" ? "Buyer-Focused" : val === "listing" ? "Listing-Focused" : "Both"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Market type */}
              <div className="space-y-2">
                <Label className="text-sm">Market Type <span className="text-xs text-muted-foreground font-normal">(multi-select)</span></Label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { val: "urban_condo", label: "Urban / Condo" },
                    { val: "suburban", label: "Suburban" },
                    { val: "rural", label: "Rural" },
                    { val: "luxury", label: "Luxury" },
                    { val: "new_construction", label: "New Construction" },
                  ] as const).map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBusinessIdentity((b) => ({ ...b, market_type: toggleMulti(b.market_type, val) }))}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        businessIdentity.market_type.includes(val)
                          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 font-medium"
                          : "border-border bg-card text-muted-foreground hover:border-violet-400",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Business model */}
              <div className="space-y-2">
                <Label className="text-sm">Business Model</Label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { val: "solo_agent", label: "Solo Agent" },
                    { val: "team_lead", label: "Team Lead" },
                    { val: "team_member", label: "Team Member" },
                  ] as const).map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBusinessIdentity((b) => ({ ...b, business_model: b.business_model === val ? "" : val }))}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        businessIdentity.business_model === val
                          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 font-medium"
                          : "border-border bg-card text-muted-foreground hover:border-violet-400",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lead sources */}
              <div className="space-y-2">
                <Label className="text-sm">Lead Sources <span className="text-xs text-muted-foreground font-normal">(multi-select)</span></Label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { val: "referrals", label: "Referrals" },
                    { val: "sphere", label: "Sphere of Influence" },
                    { val: "cold_outreach", label: "Cold Outreach" },
                    { val: "social", label: "Social Media" },
                    { val: "farming", label: "Geo Farming" },
                  ] as const).map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBusinessIdentity((b) => ({ ...b, lead_sources: toggleMulti(b.lead_sources, val) }))}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        businessIdentity.lead_sources.includes(val)
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-medium"
                          : "border-border bg-card text-muted-foreground hover:border-amber-400",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Years experience */}
              <div className="space-y-2">
                <Label className="text-sm">Years of Experience</Label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { val: "0_2", label: "0–2" },
                    { val: "3_5", label: "3–5" },
                    { val: "5_10", label: "5–10" },
                    { val: "10_plus", label: "10+" },
                  ] as const).map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBusinessIdentity((b) => ({ ...b, years_experience: b.years_experience === val ? "" : val }))}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        businessIdentity.years_experience === val
                          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 font-medium"
                          : "border-border bg-card text-muted-foreground hover:border-violet-400",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Average price range */}
              <div className="space-y-2">
                <Label className="text-sm">Average Price Range</Label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { val: "under_300k", label: "Under $300K" },
                    { val: "300_500k", label: "$300–500K" },
                    { val: "500_800k", label: "$500–800K" },
                    { val: "800k_1m", label: "$800K–$1M" },
                    { val: "over_1m", label: "$1M+" },
                  ] as const).map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setBusinessIdentity((b) => ({ ...b, avg_price_range: b.avg_price_range === val ? "" : val }))}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        businessIdentity.avg_price_range === val
                          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 font-medium"
                          : "border-border bg-card text-muted-foreground hover:border-violet-400",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Part C — Your Voice, Your Rules */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Voice, Your Rules</p>

              <div className="grid gap-1.5">
                <Label className="text-sm">Phrases I always use:</Label>
                <Textarea
                  placeholder="e.g. 'let's make it happen', 'I've got you'"
                  value={agentGoals.signature_phrases}
                  onChange={(e) => setAgentGoals((g) => ({ ...g, signature_phrases: e.target.value }))}
                  className="resize-none h-20"
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-sm">Things I never say:</Label>
                <Textarea
                  placeholder="e.g. 'it's just a house', 'the market is what it is'"
                  value={agentGoals.hard_nogos}
                  onChange={(e) => setAgentGoals((g) => ({ ...g, hard_nogos: e.target.value }))}
                  className="resize-none h-20"
                />
              </div>

              {/* Suppressed topics */}
              <div className="space-y-2">
                <Label className="text-sm">Topics to suppress in AI responses:</Label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { val: "tax_advice", label: "Tax Advice" },
                    { val: "pricing", label: "Pricing Conversations" },
                    { val: "business_growth", label: "Business Growth Tips" },
                    { val: "crm_health", label: "CRM Advice" },
                  ] as const).map(({ val, label }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAgentGoals((g) => ({ ...g, suppressed_topics: toggleMulti(g.suppressed_topics, val) }))}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        agentGoals.suppressed_topics.includes(val)
                          ? "border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 font-medium"
                          : "border-border bg-card text-muted-foreground hover:border-rose-400",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Save AI Profile button */}
            <SaveRow saving={savingAiProfile} saved={aiProfileSaved.saved} onSave={saveAiProfile} />

          </CardContent>
        </Card>
      </div>

      {/* Card P — Profile Identity */}
      <Card className="rounded-2xl border-l-4 border-l-teal-500 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-teal-500" />
            <CardTitle>Profile Identity</CardTitle>
          </div>
          <CardDescription>
            Your public-facing name and social links — synced from the iOS app and shown across your reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {/* Name + Brokerage */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Display Name</Label>
              <Input
                placeholder="Jane Smith"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Brokerage Name</Label>
              <Input
                placeholder="RE/MAX Centre"
                value={brokerageName}
                onChange={(e) => setBrokerageName(e.target.value)}
              />
            </div>
          </div>

          {/* Business Name */}
          <div className="grid gap-1.5 max-w-sm">
            <Label>Business / Team Name <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Input
              placeholder="The Smith Group"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Trade name, team name, or PREC corporation name.</p>
          </div>

          {/* Social Media URLs */}
          <div className="grid gap-3">
            <Label className="text-sm font-medium">Social Media Links <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Instagram</Label>
                <Input
                  placeholder="https://instagram.com/yourhandle"
                  value={socialInstagram}
                  onChange={(e) => setSocialInstagram(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Facebook</Label>
                <Input
                  placeholder="https://facebook.com/yourpage"
                  value={socialFacebook}
                  onChange={(e) => setSocialFacebook(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">LinkedIn</Label>
                <Input
                  placeholder="https://linkedin.com/in/yourprofile"
                  value={socialLinkedin}
                  onChange={(e) => setSocialLinkedin(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">TikTok</Label>
                <Input
                  placeholder="https://tiktok.com/@yourhandle"
                  value={socialTiktok}
                  onChange={(e) => setSocialTiktok(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5 max-w-sm">
              <Label className="text-xs text-muted-foreground">YouTube</Label>
              <Input
                placeholder="https://youtube.com/@yourchannel"
                value={socialYoutube}
                onChange={(e) => setSocialYoutube(e.target.value)}
              />
            </div>
          </div>

          <SaveRow saving={savingProfile} saved={profileSaved.saved} onSave={saveProfile} />
        </CardContent>
      </Card>

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
              onValueChange={(v) => { setProvince(v as Province); setBoardCode(""); setBoardSubregion(""); }}
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

      {/* Card 1c — Local Market Board */}
      <Card className="rounded-2xl border-l-4 border-l-cyan-500 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-500" />
            <CardTitle>Local Market Board</CardTitle>
          </div>
          <CardDescription>
            Select your real estate board for live local benchmarking. Used to show your market position,
            local price averages, and market conditions on the Dashboard.
            Data is sourced monthly from{" "}
            <a href="https://stats.crea.ca/en-CA/" target="_blank" rel="noopener noreferrer" className="underline text-cyan-600">
              CREA MLS® Statistics
            </a>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Real Estate Board</Label>
            <Select
              value={boardCode || "__none__"}
              onValueChange={(v) => { setBoardCode(v === "__none__" ? "" : v); setBoardSubregion(""); }}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder="Select your board…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None selected —</SelectItem>
                {availableBoards.map((b) => (
                  <SelectItem key={b.slug} value={b.slug}>
                    {b.label}
                  </SelectItem>
                ))}
                {availableBoards.length === 0 && (
                  <SelectItem value="__no_boards__" disabled>No boards available for this province</SelectItem>
                )}
              </SelectContent>
            </Select>
            {availableBoards.length === 0 && province && (
              <p className="text-xs text-muted-foreground mt-1">
                Your province may not have a separate board listing on CREA stats — try selecting a neighbouring province board.
              </p>
            )}
          </div>

          {selectedBoard?.subRegions && selectedBoard.subRegions.length > 0 && (
            <div className="grid gap-1.5">
              <Label>Sub-Region <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select
                value={boardSubregion || "__board_wide__"}
                onValueChange={(v) => setBoardSubregion(v === "__board_wide__" ? "" : v)}
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Use board-wide average…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__board_wide__">Board-wide average</SelectItem>
                  {selectedBoard.subRegions.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choosing a sub-region (e.g. Saint John vs. Moncton) gives more accurate local price comparisons.
              </p>
            </div>
          )}

          <SaveRow saving={savingBoard} saved={boardSaved.saved} onSave={saveBoard} />

          <p className="text-[10px] text-muted-foreground/60 leading-relaxed pt-1">
            The trademarks MLS®, Multiple Listing Service® and the associated logos are owned by The Canadian Real Estate Association (CREA) and identify the quality of services provided by real estate professionals who are members of CREA. Market statistics sourced from CREA MLS® Statistics. © {new Date().getFullYear()} CREA. All rights reserved.
          </p>
        </CardContent>
      </Card>

      {/* Card 1b — Business Structure */}
      <Card className="rounded-2xl border-l-4 border-l-emerald-500 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-500" />
            <CardTitle>Business Structure</CardTitle>
          </div>
          <CardDescription>
            Determines which expense categories are visible and how your tax estimates are calculated.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">

          {/* Business type */}
          <div className="grid gap-2">
            <Label>Business type</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-sm">
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
                    className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "border-emerald-500/60 bg-emerald-500/10 text-foreground"
                        : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {isIncorporated && (
              <p className="text-xs text-muted-foreground">
                PREC = Personal Real Estate Corporation, available in most provinces.
                Corporation = general or numbered company.
              </p>
            )}
          </div>

          {/* Compensation method — only when incorporated */}
          {isIncorporated && (
            <div className="grid gap-2">
              <Label>Compensation method</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-sm">
                {[
                  { value: "salary",    label: "Salary" },
                  { value: "dividends", label: "Dividends" },
                  { value: "mixed",     label: "Both" },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCompMethod(value as "salary" | "dividends" | "mixed")}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      compensationMethod === value
                        ? "border-emerald-500/60 bg-emerald-500/10 text-foreground"
                        : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Salary generates CPP + RRSP room; dividends don&apos;t. Mixed (both) is common.
              </p>
            </div>
          )}

          {/* Has employees */}
          <div className="grid gap-2">
            <Label>Staff on payroll</Label>
            <div className="grid grid-cols-2 gap-2 max-w-[200px]">
              {([false, true] as const).map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setHasEmployees(val)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    hasEmployees === val
                      ? "border-emerald-500/60 bg-emerald-500/10 text-foreground"
                      : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {val ? "Yes" : "No"}
                </button>
              ))}
            </div>
            {hasEmployees && (
              <div className="grid gap-1.5 max-w-xs">
                <Label className="text-muted-foreground text-xs">Number of employees</Label>
                <Input
                  type="number"
                  min="1"
                  value={numEmployees}
                  onChange={(e) => setNumEmployees(e.target.value)}
                  className="max-w-[120px]"
                />
              </div>
            )}
          </div>

          <SaveRow saving={savingBiz} saved={bizSaved.saved} onSave={saveBiz} />
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

      {/* Card PC — Post-Cap Split */}
      <Card className="rounded-2xl border-l-4 border-l-violet-400 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-violet-500" />
            <CardTitle>Post-Cap Split <span className="text-sm font-normal text-muted-foreground">(optional)</span></CardTitle>
          </div>
          <CardDescription>
            Some brokerages reduce their cut after you hit an annual GCI threshold (the &ldquo;cap&rdquo;).
            If yours does, enter the threshold and the new splits — your net GCI calculations will use
            the boosted rate for deals above the cap.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>GCI Threshold ($)</Label>
              <Input
                type="number"
                placeholder="e.g. 40000"
                value={postCapThreshold === "0" ? "" : postCapThreshold}
                onChange={(e) => setPostCapThreshold(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">GCI at which your split improves.</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Agent % after cap</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="e.g. 90"
                  className="pr-8"
                  value={postCapAgentPct}
                  onChange={(e) => setPostCapAgentPct(e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Brokerage % after cap</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="e.g. 10"
                  className="pr-8"
                  value={postCapBrokeragePct}
                  onChange={(e) => setPostCapBrokeragePct(e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave all fields at 0 if your brokerage doesn&apos;t offer a cap. Agent % + Brokerage % should sum to 100.
          </p>
          <SaveRow saving={savingPostCap} saved={postCapSaved.saved} onSave={savePostCap} />
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

      {/* Card 7 — Claiming (Home Office & Vehicle) */}
      <Card className="rounded-2xl border-l-4 border-l-blue-400 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-blue-500" />
            <CardTitle>Claiming &amp; Deductions</CardTitle>
          </div>
          <CardDescription>
            Business-use percentages for home office and vehicle deductions.
            Applies when you claim actual expenses on your T2125.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Home Office */}
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5">
                <Home className="h-3.5 w-3.5 text-muted-foreground" />
                Home office business use %
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  placeholder="e.g. 15"
                  className="pr-8"
                  value={homeOfficePct}
                  onChange={(e) => setHomeOfficePct(e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                The % of your home used exclusively for business (e.g. office room ÷ total area).
                Used to calculate allowable home office deductions on T2125 Line 9270.
              </p>
            </div>

            {/* Vehicle */}
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5">
                <Car className="h-3.5 w-3.5 text-muted-foreground" />
                Vehicle business use %
              </Label>
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
                % of total vehicle costs used for business (e.g. 80 = 80% business use).
                Use the Mileage tab in Expenses for the CRA per-km method instead.
              </p>
            </div>
          </div>

          <SaveRow saving={savingClaiming} saved={claimingSaved.saved} onSave={saveClaiming} />
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

      {/* Card — Google Integrations */}
      <Card className="rounded-2xl border-l-4 border-l-rose-400 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-rose-500" />
              <div>
                <CardTitle>Google Integrations</CardTitle>
                <CardDescription className="mt-0.5">
                  Connect your Google account to send outreach emails directly from{" "}
                  <Link href="/flight-control" className="underline underline-offset-2">
                    Flight Control
                  </Link>
                  , sync your calendar, and analyse Drive documents.
                </CardDescription>
              </div>
            </div>
            {googleConn ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={googleDisconnecting}
                    className="text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
                  >
                    {googleDisconnecting ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect Google Account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes your Google connection. You won&apos;t be able to send
                      emails from Flight Control until you reconnect.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleGoogleDisconnect}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <a href="/api/auth/google/connect">
                <Button size="sm" className="shrink-0">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Connect Google
                </Button>
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {googleConn ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/30 shrink-0">
                  <Mail className="h-4 w-4 text-rose-500" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {googleConn.display_name ?? googleConn.email_address}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {googleConn.email_address}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {googleConn.gmail_send_enabled && (
                  <Badge className="gap-1 bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 hover:bg-rose-100">
                    <Check className="h-3 w-3" /> Gmail Send
                  </Badge>
                )}
                {googleConn.calendar_sync_enabled && (
                  <Badge className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 hover:bg-blue-100">
                    <Check className="h-3 w-3" /> Calendar Sync
                  </Badge>
                )}
                {googleConn.drive_read_enabled && (
                  <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 hover:bg-emerald-100">
                    <Check className="h-3 w-3" /> Drive Access
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Connected{" "}
                {new Date(googleConn.connected_at).toLocaleDateString("en-CA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Mail className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">No Google account connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect your Google account to send outreach emails directly from Flight Control,
                  sync your calendar, and let AI analyse your Drive documents.
                </p>
              </div>
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
