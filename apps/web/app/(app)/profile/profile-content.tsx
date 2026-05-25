"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Camera,
  Check,
  Pencil,
  Upload,
  X,
  ExternalLink,
  Palette,
  User,
  Building2,
  Target,
  Calendar,
  TrendingUp,
  Hash,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  PROVINCE_LABELS,
  SPLIT_PRESET_AGENT_PCT,
  type UserSettings,
  type HistoryItem,
} from "@/lib/types/database";
import { fmtCurrency } from "@/lib/formatters";

// ── Theme config ──────────────────────────────────────────────────────────────

const COLOR_THEMES = [
  // ── Original 5 ────────────────────────────────────────────────────────────
  { value: "blue",    label: "The Classic",          bg: "oklch(0.57 0.240 261)", hex: "#1E72F2" },
  { value: "violet",  label: "The Visionary",        bg: "oklch(0.56 0.24 285)",  hex: "#7C3AED" },
  { value: "emerald", label: "The Closer",           bg: "oklch(0.60 0.19 155)",  hex: "#10B981" },
  { value: "orange",  label: "The Bold",             bg: "oklch(0.71 0.21 41)",   hex: "#F97316" },
  { value: "rose",    label: "The Disruptor",        bg: "oklch(0.58 0.23 15)",   hex: "#F43F5E" },
  // ── Extended 10 ───────────────────────────────────────────────────────────
  { value: "gold",    label: "The Achiever",         bg: "oklch(0.75 0.19 73)",   hex: "#F0A800" },
  { value: "sky",     label: "The Connector",        bg: "oklch(0.71 0.18 222)",  hex: "#0EA5E9" },
  { value: "teal",    label: "The Strategist",       bg: "oklch(0.60 0.17 192)",  hex: "#0D9488" },
  { value: "mint",    label: "The Fresh Lister",     bg: "oklch(0.73 0.15 170)",  hex: "#2DD4AA" },
  { value: "indigo",  label: "The Analyst",          bg: "oklch(0.51 0.26 272)",  hex: "#4F46E5" },
  { value: "crimson", label: "The Dealmaker",        bg: "oklch(0.55 0.23 9)",    hex: "#DC2626" },
  { value: "amber",   label: "The Momentum Player",  bg: "oklch(0.77 0.17 58)",   hex: "#F5B020" },
  { value: "fuchsia", label: "The Luxury Specialist",bg: "oklch(0.62 0.26 316)",  hex: "#D946EF" },
  { value: "cyan",    label: "The Innovator",        bg: "oklch(0.73 0.16 204)",  hex: "#06B6D4" },
  { value: "forest",  label: "The Long Game",        bg: "oklch(0.49 0.16 148)",  hex: "#166534" },
];

function getExperienceLabel(years: number | null | undefined): string {
  if (!years && years !== 0) return "Not specified";
  if (years <= 2) return "0–2 years";
  if (years <= 5) return "2–5 years";
  if (years <= 10) return "5–10 years";
  return "10+ years";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts[0]?.length >= 2)
    return parts[0].substring(0, 2).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? "AR";
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface OrgInfo {
  orgName: string;
  role: string;
  status: string;
  memberSince: string;
}

interface ProfileContentProps {
  email: string;
  settings: UserSettings | null;
  ytdGCI: number;
  ytdDeals: number;
  avgDeal: number;
  lifetimeDeals: number;
  lifetimeGCI?: number;
  historyItems?: HistoryItem[];
  bestYear?: { year: number; gci: number } | null;
  orgInfo?: OrgInfo | null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileContent({
  email,
  settings,
  ytdGCI,
  ytdDeals,
  avgDeal,
  lifetimeDeals,
  lifetimeGCI = 0,
  historyItems = [],
  bestYear = null,
  orgInfo = null,
}: ProfileContentProps) {
  const supabase = useMemo(() => createClient(), []);

  // ── Identity ──────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(settings?.display_name ?? "");
  const [brokerageName, setBrokerageName] = useState(settings?.brokerage_name ?? "");
  const [phone, setPhone] = useState(settings?.phone ?? "");
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [savedIdentity, setSavedIdentity] = useState(false);
  // Track last-saved values so cancel resets to the saved state, not stale props
  const lastSavedIdentity = useRef({ displayName: settings?.display_name ?? "", brokerageName: settings?.brokerage_name ?? "", phone: settings?.phone ?? "" });

  // ── Theme ─────────────────────────────────────────────────────────────────
  const [colorTheme, setColorTheme] = useState(settings?.color_theme ?? "blue");
  const [savingTheme, setSavingTheme] = useState(false);
  const [savedTheme, setSavedTheme] = useState(false);

  // ── Dark mode ─────────────────────────────────────────────────────────────
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── Profile photo ─────────────────────────────────────────────────────────
  const [avatarUrl, setAvatarUrl] = useState(settings?.avatar_url ?? "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ── Business identity ─────────────────────────────────────────────────────
  const [businessName, setBusinessName] = useState(settings?.business_name ?? "");
  const [businessNumber, setBusinessNumber] = useState(settings?.business_number ?? "");
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savedBusiness, setSavedBusiness] = useState(false);
  const lastSavedBusiness = useRef({ businessName: settings?.business_name ?? "", businessNumber: settings?.business_number ?? "" });

  // ── Business logo ─────────────────────────────────────────────────────────
  const [businessLogoUrl, setBusinessLogoUrl] = useState(settings?.business_logo_url ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const initials = getInitials(displayName || email.split("@")[0]);
  const currentTheme = COLOR_THEMES.find((t) => t.value === colorTheme) ?? COLOR_THEMES[0];
  const agentPct = settings?.split_preset
    ? Math.round(SPLIT_PRESET_AGENT_PCT[settings.split_preset] * 100)
    : 80;
  const memberSince = settings?.created_at
    ? new Date(settings.created_at).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
      })
    : "—";

  // ── Handlers ──────────────────────────────────────────────────────────────

  const savingIdentityRef = useRef(false);
  async function saveIdentity() {
    if (savingIdentityRef.current) return;
    savingIdentityRef.current = true;
    setSavingIdentity(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("user_settings")
        .update({
          display_name: displayName.trim(),
          brokerage_name: brokerageName.trim(),
          phone: phone.trim(),
        })
        .eq("user_id", user.id);
      if (error) { toast.error("Failed to save — please try again."); return; }
      lastSavedIdentity.current = { displayName: displayName.trim(), brokerageName: brokerageName.trim(), phone: phone.trim() };
      setEditingIdentity(false);
      setSavedIdentity(true);
      setTimeout(() => setSavedIdentity(false), 2500);
      toast.success("Profile updated ✓");
    } finally {
      savingIdentityRef.current = false;
      setSavingIdentity(false);
    }
  }

  const savingBusinessRef = useRef(false);
  async function saveBusinessIdentity() {
    if (savingBusinessRef.current) return;
    savingBusinessRef.current = true;
    setSavingBusiness(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("user_settings")
        .update({
          business_name: businessName.trim(),
          business_number: businessNumber.trim(),
        })
        .eq("user_id", user.id);
      if (error) { toast.error("Failed to save — please try again."); return; }
      lastSavedBusiness.current = { businessName: businessName.trim(), businessNumber: businessNumber.trim() };
      setEditingBusiness(false);
      setSavedBusiness(true);
      setTimeout(() => setSavedBusiness(false), 2500);
      toast.success("Business info saved ✓");
    } finally {
      savingBusinessRef.current = false;
      setSavingBusiness(false);
    }
  }

  const savingThemeRef = useRef(false);
  async function saveTheme(theme: string) {
    if (savingThemeRef.current) return;
    savingThemeRef.current = true;
    setColorTheme(theme);
    setSavingTheme(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("user_settings")
        .update({ color_theme: theme })
        .eq("user_id", user.id);
      if (error) { toast.error("Failed to save theme — please try again."); return; }
      setSavedTheme(true);
      setTimeout(() => setSavedTheme(false), 2000);
      toast.success("Theme updated — reloading…");
      window.location.reload();
    } finally {
      savingThemeRef.current = false;
      setSavingTheme(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("File too large — maximum size is 2 MB."); if (e.target) e.target.value = ""; return; }
    // Derive extension from MIME type whitelist (never from user-supplied filename)
    const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const ext = MIME_EXT[file.type];
    if (!ext) { toast.error("Only JPEG, PNG, and WebP images are allowed."); if (e.target) e.target.value = ""; return; }
    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const path = `${user.id}/avatar.${ext}`;
      const { error } = await supabase.storage
        .from("profile-media")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from("profile-media")
        .getPublicUrl(path);
      // Display with cache buster so browser shows the new image immediately
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
      // Store clean URL in DB (no cache buster)
      const { error: dbErr } = await supabase
        .from("user_settings")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);
      if (dbErr) throw dbErr;
      toast.success("Avatar updated ✓");
    } catch (err) {
      console.error("Avatar upload failed:", err);
      toast.error("Upload failed — please try again.");
    } finally {
      setUploadingAvatar(false);
      if (e.target) e.target.value = "";
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("File too large — maximum size is 2 MB."); if (e.target) e.target.value = ""; return; }
    // Derive extension from MIME type whitelist (never from user-supplied filename)
    const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const ext = MIME_EXT[file.type];
    if (!ext) { toast.error("Only JPEG, PNG, and WebP images are allowed."); if (e.target) e.target.value = ""; return; }
    setUploadingLogo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const path = `${user.id}/logo.${ext}`;
      const { error } = await supabase.storage
        .from("profile-media")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from("profile-media")
        .getPublicUrl(path);
      setBusinessLogoUrl(`${publicUrl}?t=${Date.now()}`);
      const { error: dbErr } = await supabase
        .from("user_settings")
        .update({ business_logo_url: publicUrl })
        .eq("user_id", user.id);
      if (dbErr) throw dbErr;
      toast.success("Logo updated ✓");
    } catch (err) {
      console.error("Logo upload failed:", err);
      toast.error("Upload failed — please try again.");
    } finally {
      setUploadingLogo(false);
      if (e.target) e.target.value = "";
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Profile</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Make it yours. Agents close more when they like their tools.
        </p>
      </div>

      {/* ── Hero card ─────────────────────────────────────────────────────── */}
      <Card
        className="overflow-hidden border-0 shadow-lg"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.15 0.065 265) 0%, oklch(0.10 0.055 265) 100%)",
        }}
      >
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">

            {/* Avatar — click to upload a profile photo */}
            <div className="shrink-0 flex flex-col items-center gap-2">
              <div
                className="group relative h-20 w-20 cursor-pointer overflow-hidden rounded-2xl shadow-xl"
                onClick={() => avatarInputRef.current?.click()}
                title="Click to change profile photo"
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={displayName || "Profile photo"}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-2xl font-bold text-white"
                    style={{
                      background: `linear-gradient(135deg, ${currentTheme.bg} 0%, oklch(0.10 0.055 265) 100%)`,
                      boxShadow: `0 8px 32px ${currentTheme.hex}40`,
                    }}
                  >
                    {initials}
                  </div>
                )}
                {/* Hover upload overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploadingAvatar ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Camera className="h-5 w-5 text-white" />
                      <span className="text-[9px] font-medium text-white/80">
                        Change
                      </span>
                    </>
                  )}
                </div>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <Badge
                variant="secondary"
                className="bg-white/10 text-white/60 text-[10px] font-medium tracking-wide"
              >
                Agent
              </Badge>
            </div>

            {/* Identity fields */}
            <div className="flex-1 min-w-0">
              {editingIdentity ? (
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label className="text-white/70 text-xs">Display Name</Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="border-white/20 bg-white/5 text-white placeholder:text-white/30 h-9"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-white/70 text-xs">Brokerage</Label>
                    <Input
                      value={brokerageName}
                      onChange={(e) => setBrokerageName(e.target.value)}
                      placeholder="Your brokerage name"
                      className="border-white/20 bg-white/5 text-white placeholder:text-white/30 h-9"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-white/70 text-xs">Phone</Label>
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(506) 555-0100"
                      className="border-white/20 bg-white/5 text-white placeholder:text-white/30 h-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={saveIdentity}
                      disabled={savingIdentity}
                      className="bg-primary text-white hover:bg-primary/90 h-8 text-xs"
                    >
                      {savingIdentity ? (
                        "Saving..."
                      ) : (
                        <>
                          <Check className="mr-1 h-3 w-3" /> Save
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingIdentity(false);
                        setDisplayName(lastSavedIdentity.current.displayName);
                        setBrokerageName(lastSavedIdentity.current.brokerageName);
                        setPhone(lastSavedIdentity.current.phone);
                      }}
                      className="text-white/50 hover:text-white hover:bg-white/10 h-8 text-xs"
                    >
                      <X className="mr-1 h-3 w-3" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-bold text-white">
                        {displayName || (
                          <span className="italic text-white/40">No name set</span>
                        )}
                      </h2>
                      <p className="mt-0.5 truncate text-sm text-white/55">
                        {brokerageName || (
                          <span className="italic text-white/30">No brokerage set</span>
                        )}
                      </p>
                      <p className="mt-1 truncate text-xs text-white/35">{email}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingIdentity(true)}
                      className="shrink-0 text-white/40 hover:text-white hover:bg-white/10 h-8 text-xs"
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                  </div>

                  {savedIdentity && (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400">
                      <Check className="h-3 w-3" /> Profile updated
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-white/35">
                      <Calendar className="h-3 w-3" />
                      Member since {memberSince}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-white/35">
                      <User className="h-3 w-3" />
                      {getExperienceLabel(settings?.experience_years)}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-white/35">
                      <Building2 className="h-3 w-3" />
                      {PROVINCE_LABELS[settings?.province ?? "ontario"]}
                    </span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </CardContent>
      </Card>

      {/* ── YTD Stats strip ───────────────────────────────────────────────── */}
      {(ytdDeals > 0 || lifetimeDeals > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "YTD GCI",
              value: fmtCurrency(ytdGCI),
              icon: <TrendingUp className="h-4 w-4 text-emerald-700" />,
              border: "border-emerald-200",
              bg: "from-emerald-100 to-emerald-50",
              iconBg: "bg-emerald-200",
              labelColor: "text-emerald-700",
            },
            {
              label: "YTD Deals",
              value: String(ytdDeals),
              icon: <Check className="h-4 w-4 text-blue-700" />,
              border: "border-blue-200",
              bg: "from-blue-100 to-blue-50",
              iconBg: "bg-blue-200",
              labelColor: "text-blue-700",
            },
            {
              label: "Avg / Deal",
              value: avgDeal > 0 ? fmtCurrency(avgDeal) : "—",
              icon: <Target className="h-4 w-4 text-violet-700" />,
              border: "border-violet-200",
              bg: "from-violet-100 to-violet-50",
              iconBg: "bg-violet-200",
              labelColor: "text-violet-700",
            },
            {
              label: "Lifetime Deals",
              value: String(lifetimeDeals),
              icon: <Calendar className="h-4 w-4 text-amber-700" />,
              border: "border-amber-200",
              bg: "from-amber-100 to-amber-50",
              iconBg: "bg-amber-200",
              labelColor: "text-amber-700",
            },
          ].map((stat) => (
            <Card key={stat.label} className={`rounded-2xl border ${stat.border} bg-gradient-to-br ${stat.bg} shadow-sm`}>
              <CardContent className="p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${stat.iconBg}`}>
                    {stat.icon}
                  </div>
                  <span className={`text-[11px] font-semibold uppercase tracking-wide ${stat.labelColor}`}>
                    {stat.label}
                  </span>
                </div>
                <p className="text-lg font-bold tabular-nums text-slate-800">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Organization Membership ─────────────────────────────────────── */}
      {orgInfo && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Organization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              <ConfigRow label="Organization" value={orgInfo.orgName} />
              <ConfigRow
                label="Role"
                value={orgInfo.role.charAt(0).toUpperCase() + orgInfo.role.slice(1).replace("_", " ")}
              />
              <ConfigRow
                label="Status"
                value={orgInfo.status.charAt(0).toUpperCase() + orgInfo.status.slice(1)}
              />
              <ConfigRow
                label="Member Since"
                value={
                  orgInfo.memberSince
                    ? new Date(orgInfo.memberSince).toLocaleDateString("en-CA", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "---"
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── My Business, By the Numbers ───────────────────────────────────── */}
      {(lifetimeDeals > 0 || historyItems.length > 0) && (
        <CareerSummaryCard
          experienceYears={settings?.experience_years ?? null}
          lifetimeDeals={lifetimeDeals}
          lifetimeGCI={lifetimeGCI}
          bestYear={bestYear}
          goalGCI={settings?.goal_gci ?? 0}
          historyItems={historyItems}
        />
      )}

      {/* ── Colour Theme + Business Configuration ─────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">

        {/* Colour Theme card */}
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            {/* Appearance toggle */}
            {mounted && (
              <div className="flex items-center justify-between py-3 mb-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium">Dark Mode</p>
                  <p className="text-xs text-muted-foreground">Switch between light and dark interface</p>
                </div>
                <button
                  onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted transition-colors"
                >
                  {resolvedTheme === "dark"
                    ? <><Sun className="h-4 w-4" /> Light</>
                    : <><Moon className="h-4 w-4" /> Dark</>}
                </button>
              </div>
            )}
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Palette className="h-4 w-4 text-muted-foreground" />
              Colour Theme
              {savedTheme && (
                <span className="ml-auto flex items-center gap-1 text-[11px] font-normal text-emerald-500">
                  <Check className="h-3 w-3" /> Applied
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* 15 swatches — 5 per row, 3 rows */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {COLOR_THEMES.map((theme) => {
                const isSelected = colorTheme === theme.value;
                return (
                  <div key={theme.value} className="flex flex-col items-center gap-1">
                    <button
                      disabled={savingTheme}
                      onClick={() => saveTheme(theme.value)}
                      title={theme.label}
                      className={cn(
                        "relative flex h-10 w-10 items-center justify-center rounded-full transition-all",
                        isSelected
                          ? "scale-110 shadow-lg"
                          : "opacity-75 hover:scale-105 hover:opacity-100",
                      )}
                      style={{
                        background: theme.bg,
                        outline: isSelected ? `2px solid ${theme.hex}` : undefined,
                        outlineOffset: isSelected ? "3px" : undefined,
                      }}
                    >
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 drop-shadow" style={{ color: theme.value === "gold" || theme.value === "amber" || theme.value === "mint" || theme.value === "cyan" ? "#15110A" : "white" }} />
                      )}
                    </button>
                    <span className="text-center text-[9px] leading-tight text-muted-foreground max-w-[52px]">
                      {theme.label.replace("The ", "")}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Current:{" "}
              <span className="font-medium text-foreground">
                {currentTheme.label}
              </span>
              . Changes apply immediately.
            </p>
          </CardContent>
        </Card>

        {/* Business Configuration card */}
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Business Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              <ConfigRow
                label="Province"
                value={PROVINCE_LABELS[settings?.province ?? "ontario"]}
              />
              <ConfigRow
                label="Commission Split"
                value={`${agentPct}% / ${100 - agentPct}%`}
              />
              <ConfigRow
                label="Monthly Fee"
                value={
                  settings?.monthly_brokerage_fee
                    ? fmtCurrency(settings.monthly_brokerage_fee) + " / mo"
                    : "Not set"
                }
              />
              <ConfigRow
                label="Experience"
                value={getExperienceLabel(settings?.experience_years)}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => (window.location.href = "/settings")}
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Edit in Settings
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Business Identity card ─────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Hash className="h-4 w-4 text-muted-foreground" />
            Business Identity
            {savedBusiness && (
              <span className="ml-auto flex items-center gap-1 text-[11px] font-normal text-emerald-500">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8 sm:grid-cols-2">

            {/* Left: Business Logo */}
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Business Logo
              </p>
              <div className="flex items-start gap-4">
                {/* Logo preview / click-to-upload target */}
                <div
                  className="group relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/30 transition-colors hover:border-primary/50"
                  onClick={() => logoInputRef.current?.click()}
                  title="Click to upload business logo"
                >
                  {businessLogoUrl ? (
                    <Image
                      src={businessLogoUrl}
                      alt="Business logo"
                      fill
                      unoptimized
                      className="object-contain p-2"
                    />
                  ) : (
                    <Building2 className="h-7 w-7 text-muted-foreground/40" />
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    {uploadingLogo ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        <Upload className="h-4 w-4 text-white" />
                        <span className="text-[9px] font-medium text-white/80">
                          Upload
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {businessLogoUrl ? "Logo uploaded ✓" : "No logo yet"}
                  </p>
                  <p>Appears on reports and invoices.</p>
                  <p className="text-[11px]">PNG, JPG or WebP · Max 2 MB</p>
                  {businessLogoUrl && (
                    <button
                      className="mt-1 text-[11px] text-primary hover:underline"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      Change logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Trade Name + GST/HST Number */}
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Registration Details
              </p>
              {editingBusiness ? (
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Trade Name / Team</Label>
                    <Input
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. The Smith Group"
                      className="h-9"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Personal brand or team name, distinct from your brokerage.
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">GST/HST Number</Label>
                    <Input
                      value={businessNumber}
                      onChange={(e) => setBusinessNumber(e.target.value)}
                      placeholder="e.g. 123456789 RT 0001"
                      className="h-9 font-mono tracking-wide"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      CRA registration number for collecting and remitting GST/HST.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={saveBusinessIdentity}
                      disabled={savingBusiness}
                      className="h-8 text-xs"
                    >
                      {savingBusiness ? (
                        "Saving..."
                      ) : (
                        <>
                          <Check className="mr-1 h-3 w-3" /> Save
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingBusiness(false);
                        setBusinessName(lastSavedBusiness.current.businessName);
                        setBusinessNumber(lastSavedBusiness.current.businessNumber);
                      }}
                      className="h-8 text-xs"
                    >
                      <X className="mr-1 h-3 w-3" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <ConfigRow
                    label="Trade Name / Team"
                    value={businessName || "—"}
                  />
                  <ConfigRow
                    label="GST/HST Number"
                    value={businessNumber || "Not registered"}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingBusiness(true)}
                    className="mt-1 h-7 pl-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Edit details
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Annual Goals card ─────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-muted-foreground" />
            Annual Goals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <GoalItem
              label="GCI Target"
              value={
                settings?.goal_gci
                  ? fmtCurrency(settings.goal_gci)
                  : "Not set"
              }
              current={ytdGCI}
              goal={settings?.goal_gci ?? 0}
              color="emerald"
            />
            <GoalItem
              label="Deals Target"
              value={
                settings?.goal_transactions
                  ? `${settings.goal_transactions} deals`
                  : "Not set"
              }
              current={ytdDeals}
              goal={settings?.goal_transactions ?? 0}
              color="blue"
            />
            <GoalItem
              label="Volume Target"
              value={
                settings?.goal_volume
                  ? fmtCurrency(settings.goal_volume)
                  : "Not set"
              }
              current={0}
              goal={settings?.goal_volume ?? 0}
              color="violet"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => (window.location.href = "/settings")}
          >
            <ExternalLink className="mr-1 h-3 w-3" />
            Update Goals in Settings
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium text-foreground">{value}</span>
    </div>
  );
}

function GoalItem({
  label,
  value,
  current,
  goal,
  color,
}: {
  label: string;
  value: string;
  current: number;
  goal: number;
  color: "emerald" | "blue" | "violet";
}) {
  const pct = goal > 0 ? Math.min(1, current / goal) : 0;
  const colorStyles = {
    emerald: {
      container: "border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-50",
      label: "text-emerald-700",
      track: "bg-emerald-500",
      progress: "text-emerald-700",
    },
    blue: {
      container: "border-blue-200 bg-gradient-to-br from-blue-100 to-blue-50",
      label: "text-blue-700",
      track: "bg-blue-500",
      progress: "text-blue-700",
    },
    violet: {
      container: "border-violet-200 bg-gradient-to-br from-violet-100 to-violet-50",
      label: "text-violet-700",
      track: "bg-violet-500",
      progress: "text-violet-700",
    },
  };
  const styles = colorStyles[color];

  return (
    <div className={cn("rounded-xl border p-3.5 shadow-sm", styles.container)}>
      <p className={cn("text-[11px] font-semibold uppercase tracking-wide", styles.label)}>
        {label}
      </p>
      <p className="mt-1 text-base font-bold text-slate-800">{value}</p>
      {goal > 0 && (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/60">
            <div
              className={cn("h-full rounded-full transition-all", styles.track)}
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          <p className={cn("mt-1 text-[10px] font-medium", styles.progress)}>
            {Math.round(pct * 100)}% of goal
          </p>
        </div>
      )}
    </div>
  );
}

// ── CareerSummaryCard ─────────────────────────────────────────────────────────

function StatBlock({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-0.5 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function CareerSummaryCard({
  experienceYears,
  lifetimeDeals,
  lifetimeGCI,
  bestYear,
  goalGCI,
  historyItems,
}: {
  experienceYears: number | null;
  lifetimeDeals: number;
  lifetimeGCI: number;
  bestYear: { year: number; gci: number } | null;
  goalGCI: number;
  historyItems: HistoryItem[];
}) {
  // Compute goal achievement streak (consecutive years hitting goal, working backwards)
  let goalStreakYears = 0;
  if (goalGCI > 0 && historyItems.length > 0) {
    const sorted = [...historyItems].sort((a, b) => b.year - a.year);
    for (const h of sorted) {
      if (h.annual_gci >= goalGCI) goalStreakYears++;
      else break;
    }
  }

  return (
    <Card className="rounded-2xl border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-slate-50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-indigo-800">
          My Business, By the Numbers
        </CardTitle>
        <p className="text-xs text-muted-foreground">Your career in real estate at a glance</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {experienceYears !== null && experienceYears > 0 && (
            <StatBlock
              label="Experience"
              value={`${experienceYears}+`}
              sub="years in real estate"
            />
          )}
          <StatBlock
            label="Lifetime Deals"
            value={String(lifetimeDeals)}
            sub="closed transactions"
          />
          {lifetimeGCI > 0 && (
            <StatBlock
              label="Lifetime GCI"
              value={fmtCurrency(lifetimeGCI)}
              sub="gross commission earned"
            />
          )}
          {bestYear && (
            <StatBlock
              label="Best Year"
              value={fmtCurrency(bestYear.gci)}
              sub={String(bestYear.year)}
            />
          )}
          {goalStreakYears >= 2 && (
            <StatBlock
              label="Goal Streak"
              value={`${goalStreakYears} yr${goalStreakYears !== 1 ? "s" : ""}`}
              sub="goals hit in a row"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
