"use client";

import { useState, useRef } from "react";
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
} from "lucide-react";
import {
  PROVINCE_LABELS,
  SPLIT_PRESET_AGENT_PCT,
  type UserSettings,
} from "@/lib/types/database";
import { fmtCurrency, fmtCompact } from "@/lib/formatters";

// ── Theme config ──────────────────────────────────────────────────────────────

const COLOR_THEMES = [
  { value: "blue",    label: "The Classic",   bg: "oklch(0.57 0.240 261)", hex: "#1E72F2" },
  { value: "violet",  label: "The Visionary", bg: "oklch(0.56 0.24 285)",  hex: "#7C3AED" },
  { value: "emerald", label: "The Closer",    bg: "oklch(0.60 0.19 155)",  hex: "#10B981" },
  { value: "orange",  label: "The Bold",      bg: "oklch(0.71 0.21 41)",   hex: "#F97316" },
  { value: "rose",    label: "The Disruptor", bg: "oklch(0.58 0.23 15)",   hex: "#F43F5E" },
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

interface ProfileContentProps {
  email: string;
  settings: UserSettings | null;
  ytdGCI: number;
  ytdDeals: number;
  avgDeal: number;
  lifetimeDeals: number;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileContent({
  email,
  settings,
  ytdGCI,
  ytdDeals,
  avgDeal,
  lifetimeDeals,
}: ProfileContentProps) {

  // ── Identity ──────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(settings?.display_name ?? "");
  const [brokerageName, setBrokerageName] = useState(settings?.brokerage_name ?? "");
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [savedIdentity, setSavedIdentity] = useState(false);

  // ── Theme ─────────────────────────────────────────────────────────────────
  const [colorTheme, setColorTheme] = useState(settings?.color_theme ?? "blue");
  const [savingTheme, setSavingTheme] = useState(false);
  const [savedTheme, setSavedTheme] = useState(false);

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

  async function saveIdentity() {
    setSavingIdentity(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("user_settings")
        .update({
          display_name: displayName.trim(),
          brokerage_name: brokerageName.trim(),
        })
        .eq("user_id", user.id);
      setEditingIdentity(false);
      setSavedIdentity(true);
      setTimeout(() => setSavedIdentity(false), 2500);
    } finally {
      setSavingIdentity(false);
    }
  }

  async function saveBusinessIdentity() {
    setSavingBusiness(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("user_settings")
        .update({
          business_name: businessName.trim(),
          business_number: businessNumber.trim(),
        })
        .eq("user_id", user.id);
      setEditingBusiness(false);
      setSavedBusiness(true);
      setTimeout(() => setSavedBusiness(false), 2500);
    } finally {
      setSavingBusiness(false);
    }
  }

  async function saveTheme(theme: string) {
    setColorTheme(theme);
    setSavingTheme(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("user_settings")
        .update({ color_theme: theme })
        .eq("user_id", user.id);
      setSavedTheme(true);
      setTimeout(() => setSavedTheme(false), 2000);
      window.location.reload();
    } finally {
      setSavingTheme(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
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
      await supabase
        .from("user_settings")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);
    } catch (err) {
      console.error("Avatar upload failed:", err);
    } finally {
      setUploadingAvatar(false);
      if (e.target) e.target.value = "";
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${user.id}/logo.${ext}`;
      const { error } = await supabase.storage
        .from("profile-media")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from("profile-media")
        .getPublicUrl(path);
      setBusinessLogoUrl(`${publicUrl}?t=${Date.now()}`);
      await supabase
        .from("user_settings")
        .update({ business_logo_url: publicUrl })
        .eq("user_id", user.id);
    } catch (err) {
      console.error("Logo upload failed:", err);
    } finally {
      setUploadingLogo(false);
      if (e.target) e.target.value = "";
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Profile</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your identity, business details, and colour theme.
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
                        setDisplayName(settings?.display_name ?? "");
                        setBrokerageName(settings?.brokerage_name ?? "");
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
              icon: <TrendingUp className="h-4 w-4 text-emerald-500" />,
            },
            {
              label: "YTD Deals",
              value: String(ytdDeals),
              icon: <Check className="h-4 w-4 text-blue-500" />,
            },
            {
              label: "Avg / Deal",
              value: avgDeal > 0 ? fmtCurrency(avgDeal) : "—",
              icon: <Target className="h-4 w-4 text-violet-500" />,
            },
            {
              label: "Lifetime Deals",
              value: fmtCompact(lifetimeDeals),
              icon: <Calendar className="h-4 w-4 text-amber-500" />,
            },
          ].map((stat) => (
            <Card key={stat.label} className="border bg-card">
              <CardContent className="p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  {stat.icon}
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Colour Theme + Business Configuration ─────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">

        {/* Colour Theme card */}
        <Card>
          <CardHeader className="pb-3">
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
            <div className="grid grid-cols-5 gap-2">
              {COLOR_THEMES.map((theme) => (
                <button
                  key={theme.value}
                  disabled={savingTheme}
                  onClick={() => saveTheme(theme.value)}
                  title={theme.label}
                  className={cn(
                    "group relative flex aspect-square items-center justify-center rounded-xl transition-all",
                    colorTheme === theme.value
                      ? "scale-110 shadow-lg"
                      : "opacity-80 hover:scale-105 hover:opacity-100",
                  )}
                  style={{
                    background: theme.bg,
                    outline:
                      colorTheme === theme.value
                        ? `2px solid ${theme.hex}`
                        : undefined,
                    outlineOffset:
                      colorTheme === theme.value ? "3px" : undefined,
                  }}
                >
                  {colorTheme === theme.value && (
                    <Check className="h-4 w-4 text-white drop-shadow" />
                  )}
                </button>
              ))}
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
        <Card>
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
      <Card>
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
                        setBusinessName(settings?.business_name ?? "");
                        setBusinessNumber(settings?.business_number ?? "");
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
      <Card>
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
  const trackColors = {
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    violet: "bg-violet-500",
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base font-bold text-foreground">{value}</p>
      {goal > 0 && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-border">
            <div
              className={cn("h-full rounded-full transition-all", trackColors[color])}
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {Math.round(pct * 100)}% of goal
          </p>
        </div>
      )}
    </div>
  );
}
