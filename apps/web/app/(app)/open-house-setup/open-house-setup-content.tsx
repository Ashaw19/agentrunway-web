"use client";

/**
 * open-house-setup-content.tsx
 *
 * In-app form that lets each agent configure their persistent branded
 * open house page. One row per agent in `agent_open_houses`.
 *
 * Slug is auto-generated from display_name on first save; locked after
 * first publish. Agents update property details before each new open
 * house — the URL never changes.
 *
 * Property photo is uploaded to the existing `profile-media` Supabase
 * Storage bucket at {user_id}/open-house/property.{ext}.
 */

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn }       from "@/lib/utils";
import {
  Home,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  ImagePlus,
  ToggleLeft,
  ToggleRight,
  CalendarDays,
  Clock,
  MapPin,
  DollarSign,
  User,
  Building2,
  Phone,
  Mail,
  Link2,
  AlertCircle,
  Camera,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50);
}

// Allowed MIME types for photo uploads
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

const BASE_URL = "https://agentrunway.ca";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentOpenHouse {
  id:                 string;
  user_id:            string;
  slug:               string;
  property_address:   string;
  property_city:      string;
  property_province:  string;
  property_price:     number | null;
  property_photo_url: string;
  open_house_date:    string | null;
  open_house_start:   string | null;
  open_house_end:     string | null;
  description:        string;
  agent_display_name: string;
  agent_photo_url:    string;
  agent_brokerage:    string;
  agent_phone:        string;
  agent_email:        string;
  is_active:          boolean;
  created_at:         string;
  updated_at:         string;
}

interface Props {
  userId:       string;
  userEmail:    string;
  displayName:  string;
  brokerageName: string;
  phone:        string;
  avatarUrl:    string;
  existingPage: AgentOpenHouse | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OpenHouseSetupContent({
  userId,
  userEmail,
  displayName,
  brokerageName,
  phone,
  avatarUrl,
  existingPage,
}: Props) {
  const supabase = createClient();

  // ── Form state (property) ─────────────────────────────────────────────────
  const [slug,             setSlug]           = useState(existingPage?.slug             ?? slugify(displayName));
  const [propertyAddress,  setPropertyAddress] = useState(existingPage?.property_address  ?? "");
  const [propertyCity,     setPropertyCity]    = useState(existingPage?.property_city     ?? "");
  const [propertyProvince, setPropertyProvince]= useState(existingPage?.property_province ?? "");
  const [propertyPrice,    setPropertyPrice]   = useState(existingPage?.property_price != null ? String(existingPage.property_price) : "");
  const [propertyPhotoUrl, setPropertyPhotoUrl]= useState(existingPage?.property_photo_url ?? "");
  const [openHouseDate,    setOpenHouseDate]   = useState(existingPage?.open_house_date    ?? "");
  const [openHouseStart,   setOpenHouseStart]  = useState(existingPage?.open_house_start   ?? "");
  const [openHouseEnd,     setOpenHouseEnd]    = useState(existingPage?.open_house_end      ?? "");
  const [description,      setDescription]     = useState(existingPage?.description         ?? "");

  // ── Form state (agent card) ───────────────────────────────────────────────
  const [agentName,     setAgentName]     = useState(existingPage?.agent_display_name ?? displayName);
  const [agentPhotoUrl, _setAgentPhotoUrl] = useState(existingPage?.agent_photo_url    ?? avatarUrl);
  const [agentBrokerage, setAgentBrokerage]= useState(existingPage?.agent_brokerage   ?? brokerageName);
  const [agentPhone,    setAgentPhone]    = useState(existingPage?.agent_phone         ?? phone);
  const [agentEmail,    setAgentEmail]    = useState(existingPage?.agent_email         ?? userEmail);
  const [isActive,      setIsActive]      = useState(existingPage?.is_active ?? true);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving,          setSaving]          = useState(false);
  const [uploadingPhoto,  setUploadingPhoto]  = useState(false);
  const [copied,          setCopied]          = useState(false);
  const [hasPublished,    setHasPublished]    = useState(!!existingPage);
  const [slugLocked,      setSlugLocked]      = useState(!!existingPage);

  const publicUrl = `${BASE_URL}/open-house/${slug}`;

  // ── Slug auto-update when display name changes (pre-publish only) ─────────
  useEffect(() => {
    if (!slugLocked && !existingPage) {
      const generated = slugify(displayName);
      if (generated) setSlug(generated);
    }
  }, [displayName, slugLocked, existingPage]);

  // ── Copy link ─────────────────────────────────────────────────────────────
  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(publicUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicUrl]);

  // ── Property photo upload ─────────────────────────────────────────────────
  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large — max 5 MB.");
      if (e.target) e.target.value = "";
      return;
    }
    const ext = MIME_EXT[file.type];
    if (!ext) {
      toast.error("Only JPEG, PNG, and WebP images are allowed.");
      if (e.target) e.target.value = "";
      return;
    }
    setUploadingPhoto(true);
    try {
      const path = `${userId}/open-house/property.${ext}`;
      const { error } = await supabase.storage
        .from("profile-media")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl: url } } = supabase.storage
        .from("profile-media")
        .getPublicUrl(path);
      setPropertyPhotoUrl(`${url}?t=${Date.now()}`);
      toast.success("Property photo uploaded ✓");
    } catch (err) {
      console.error("[open-house-setup] photo upload failed:", err);
      toast.error("Upload failed — please try again.");
    } finally {
      setUploadingPhoto(false);
      if (e.target) e.target.value = "";
    }
  }, [userId, supabase]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const trimmedSlug = slug.trim();
    if (!trimmedSlug || !/^[a-z0-9][a-z0-9-]{1,59}$/.test(trimmedSlug)) {
      toast.error("URL slug must be 2–60 characters (lowercase letters, numbers, hyphens only).");
      return;
    }
    if (!agentName.trim()) {
      toast.error("Agent display name is required.");
      return;
    }

    setSaving(true);
    try {
      // Clean property photo URL (strip cache-buster for DB storage)
      const cleanPhotoUrl = propertyPhotoUrl.split("?")[0] ?? "";

      const payload = {
        user_id:            userId,
        slug:               trimmedSlug,
        property_address:   propertyAddress.trim(),
        property_city:      propertyCity.trim(),
        property_province:  propertyProvince.trim(),
        property_price:     propertyPrice ? parseFloat(propertyPrice.replace(/[$,]/g, "")) || null : null,
        property_photo_url: cleanPhotoUrl,
        open_house_date:    openHouseDate   || null,
        open_house_start:   openHouseStart  || null,
        open_house_end:     openHouseEnd    || null,
        description:        description.trim(),
        agent_display_name: agentName.trim(),
        agent_photo_url:    agentPhotoUrl.split("?")[0] ?? "",
        agent_brokerage:    agentBrokerage.trim(),
        agent_phone:        agentPhone.trim(),
        agent_email:        agentEmail.trim(),
        is_active:          isActive,
        updated_at:         new Date().toISOString(),
      };

      const { error } = await supabase
        .from("agent_open_houses")
        .upsert(payload, { onConflict: "user_id" });

      if (error) {
        // Slug uniqueness conflict
        if (error.message.includes("unique") || error.code === "23505") {
          toast.error("That URL slug is already taken. Please choose a different one.");
        } else {
          throw error;
        }
        return;
      }

      setHasPublished(true);
      setSlugLocked(true);
      toast.success(isActive ? "Open house page saved and live ✓" : "Open house page saved (inactive) ✓");
    } catch (err) {
      console.error("[open-house-setup] save failed:", err);
      toast.error("Failed to save — please try again.");
    } finally {
      setSaving(false);
    }
  }, [
    slug, userId, propertyAddress, propertyCity, propertyProvince,
    propertyPrice, propertyPhotoUrl, openHouseDate, openHouseStart,
    openHouseEnd, description, agentName, agentPhotoUrl,
    agentBrokerage, agentPhone, agentEmail, isActive, supabase,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Open House Page
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your persistent sign-in page. Update the property details before each open house — the URL never changes.
          </p>
        </div>
        {hasPublished && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted sm:mt-0"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Preview page
          </a>
        )}
      </div>

      {/* ── Status banner — link to share ────────────────────────────────── */}
      {hasPublished && (
        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                isActive
                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                  : "bg-muted-foreground",
              )}
            />
            <span className="font-mono text-xs text-muted-foreground sm:text-sm">
              {publicUrl}
            </span>
          </div>
          <button
            type="button"
            onClick={copyLink}
            className="ml-3 flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Copy link"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      )}

      {/* ── URL Slug ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Your Page URL
          </CardTitle>
          <CardDescription>
            {slugLocked
              ? "Your URL is locked — it won't change between open houses."
              : "Auto-generated from your name. You can edit it once before publishing."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">
              agentrunway.ca/open-house/
            </span>
            <Input
              value={slug}
              onChange={(e) => !slugLocked && setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              readOnly={slugLocked}
              maxLength={60}
              placeholder="your-name"
              className={cn(
                "bg-background",
                slugLocked && "cursor-default opacity-60",
              )}
            />
          </div>
          {slugLocked && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              URL is locked after first publish to keep your sign-in links working.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Property details ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Home className="h-4 w-4 text-primary" aria-hidden="true" />
            Current Property
          </CardTitle>
          <CardDescription>
            Update these details before each open house.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Property photo */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Property Photo
            </Label>
            <div className="relative">
              {propertyPhotoUrl ? (
                <div className="group relative overflow-hidden rounded-xl">
                  <Image
                    src={propertyPhotoUrl}
                    alt="Property photo"
                    width={672}
                    height={240}
                    className="h-[180px] w-full object-cover"
                    unoptimized
                  />
                  <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex items-center gap-2 rounded-lg bg-black/60 px-4 py-2 text-sm font-semibold text-white">
                      <Camera className="h-4 w-4" />
                      Change photo
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto}
                    />
                  </label>
                  {uploadingPhoto && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                </div>
              ) : (
                <label className={cn(
                  "flex h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  uploadingPhoto && "pointer-events-none opacity-60",
                )}>
                  {uploadingPhoto ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-8 w-8" />
                      <span className="text-sm font-medium">Upload property photo</span>
                      <span className="text-xs">JPEG, PNG, WebP — max 5 MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhoto}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="property-address" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <MapPin className="h-3 w-3" />
                Street Address
              </Label>
              <Input
                id="property-address"
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
                placeholder="123 Main Street"
                maxLength={200}
                className="bg-background"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="property-city" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                City
              </Label>
              <Input
                id="property-city"
                value={propertyCity}
                onChange={(e) => setPropertyCity(e.target.value)}
                placeholder="Moncton"
                maxLength={100}
                className="bg-background"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="property-province" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Province
              </Label>
              <Input
                id="property-province"
                value={propertyProvince}
                onChange={(e) => setPropertyProvince(e.target.value)}
                placeholder="NB"
                maxLength={50}
                className="bg-background"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="property-price" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                Asking Price (optional)
              </Label>
              <Input
                id="property-price"
                value={propertyPrice}
                onChange={(e) => setPropertyPrice(e.target.value)}
                placeholder="$450,000"
                maxLength={20}
                className="bg-background"
              />
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="open-house-date" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                Date
              </Label>
              <Input
                id="open-house-date"
                type="date"
                value={openHouseDate}
                onChange={(e) => setOpenHouseDate(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="open-house-start" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3 w-3" />
                Start Time
              </Label>
              <Input
                id="open-house-start"
                type="time"
                value={openHouseStart}
                onChange={(e) => setOpenHouseStart(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="open-house-end" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3 w-3" />
                End Time
              </Label>
              <Input
                id="open-house-end"
                type="time"
                value={openHouseEnd}
                onChange={(e) => setOpenHouseEnd(e.target.value)}
                className="bg-background"
              />
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Property Description (optional)
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="3-bedroom bungalow with open-concept kitchen, finished basement, and large backyard..."
              rows={3}
              maxLength={600}
              className="resize-none bg-background"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Agent card ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-primary" aria-hidden="true" />
            Your Agent Card
          </CardTitle>
          <CardDescription>
            Visitors see your name, photo, and brokerage on the sign-in page.
            Your profile photo and brokerage are pre-filled from your AR profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Agent photo preview */}
          {agentPhotoUrl && (
            <div className="flex items-center gap-4">
              <Image
                src={agentPhotoUrl}
                alt="Agent photo"
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-border"
                unoptimized
              />
              <div className="text-sm text-muted-foreground">
                Profile photo from your AR account.{" "}
                <a href="/profile" className="text-primary underline underline-offset-4 hover:opacity-80">
                  Update in Profile →
                </a>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agent-name" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <User className="h-3 w-3" />
                Display Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="agent-name"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Jane Smith"
                maxLength={120}
                className="bg-background"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agent-brokerage" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Building2 className="h-3 w-3" />
                Brokerage
              </Label>
              <Input
                id="agent-brokerage"
                value={agentBrokerage}
                onChange={(e) => setAgentBrokerage(e.target.value)}
                placeholder="Royal LePage Atlantic"
                maxLength={120}
                className="bg-background"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agent-phone" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Phone className="h-3 w-3" />
                Phone
              </Label>
              <Input
                id="agent-phone"
                value={agentPhone}
                onChange={(e) => setAgentPhone(e.target.value)}
                placeholder="(506) 555-0100"
                maxLength={30}
                className="bg-background"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agent-email" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Mail className="h-3 w-3" />
                Reply-to Email
              </Label>
              <Input
                id="agent-email"
                type="email"
                value={agentEmail}
                onChange={(e) => setAgentEmail(e.target.value)}
                placeholder="jane@brokerage.ca"
                maxLength={254}
                className="bg-background"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Active toggle + Save ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Active toggle */}
        <button
          type="button"
          onClick={() => setIsActive((v) => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-pressed={isActive}
        >
          {isActive ? (
            <>
              <ToggleRight className="h-6 w-6 text-emerald-600" aria-hidden="true" />
              <span className="font-medium text-emerald-600">Page is live</span>
              <span className="text-muted-foreground">— visible to visitors</span>
            </>
          ) : (
            <>
              <ToggleLeft className="h-6 w-6" aria-hidden="true" />
              <span className="font-medium">Page is inactive</span>
              <span className="text-muted-foreground">— hidden from public</span>
            </>
          )}
        </button>

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="disabled:opacity-60 sm:min-w-[130px]"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            hasPublished ? "Save Changes" : "Publish Page"
          )}
        </Button>
      </div>

      {/* ── Share instructions (post-publish) ────────────────────────────── */}
      {hasPublished && isActive && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-primary">How to use your open house page</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <li>• Print the QR code for your sign-in table — buyers scan and register on their phone</li>
            <li>• Share the link in your listing&apos;s social posts: <span className="font-mono text-foreground">{publicUrl}</span></li>
            <li>• Before the next open house, update the property details above and save</li>
            <li>• New registrations appear automatically in your Flight Control CRM at Boarding stage</li>
          </ul>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy link"}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open page
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default OpenHouseSetupContent;
