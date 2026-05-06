"use client";

/**
 * Social Media Studio — Agent Runway
 * Month in Review carousel builder.
 *
 * Two output paths from one shared PostConfig:
 *   1. Quick Post — preview → Post to Instagram
 *   2. Canva Export — download ZIP package for finishing in Canva
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  CheckCircle,
  Sparkles,
  Link2,
  RefreshCw,
  Loader2,
  Send,
  AlertCircle,
  Package,
  ToggleLeft,
  ToggleRight,
  ImagePlus,
  X as XIcon,
} from "lucide-react";
import { Instagram, Facebook } from "@/components/icons/brand-icons";
import { toast } from "sonner";
import {
  computeGCI,
  type Transaction,
  type UserSettings,
} from "@/lib/types/database";
import {
  type TemplateFamily,
  type SoldWording,
  type PostConfig,
  type SlideSpec,
  TEMPLATE_FAMILIES,
  SOLD_WORDING_OPTIONS,
  MONTH_NAMES,
  buildSlides,
  buildSlideApiUrl,
  generateCaption,
  buildCanvaContentJson,
  buildCanvaInstructions,
} from "@/lib/social/post-engine";
import { fmtCurrency } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import dynamic from "next/dynamic";

const PhotoCropDialog = dynamic(() => import("@/components/photo-crop-dialog").then(m => m.PhotoCropDialog), { ssr: false });
import JSZip from "jszip";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Connection {
  platform:         string;
  account_name:     string | null;
  account_id:       string | null;
  token_expires_at: string | null;
}

interface Props {
  settings:     UserSettings | null;
  transactions: Transaction[];
  connections:  Connection[];
}

// ── Main component ────────────────────────────────────────────────────────────

export function SocialContent({ settings, transactions, connections }: Props) {
  const now = new Date();
  const { user } = useUser();
  const supabase = useMemo(() => createClient(), []);

  // ── Post setup state ───────────────────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [selectedYear,  setSelectedYear]  = useState<number>(now.getFullYear());
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());

  // ── Template ───────────────────────────────────────────────────────────────
  const [templateFamily, setTemplateFamily] = useState<TemplateFamily>("classic-luxury");

  // ── Branding (default from settings, user can override) ───────────────────
  const [logoUrl,     setLogoUrl]     = useState<string>(settings?.business_logo_url ?? "");
  const [headshotUrl, setHeadshotUrl] = useState<string>(settings?.avatar_url        ?? "");
  const [cutoutUrl,   setCutoutUrl]   = useState<string>(settings?.agent_cutout_url  ?? "");

  // ── Slide options ──────────────────────────────────────────────────────────
  const [soldWording,    setSoldWording]    = useState<SoldWording>("SOLD");
  const [showLogo,       setShowLogo]       = useState<boolean>(!!(settings?.business_logo_url));
  const [showHeadshot,   setShowHeadshot]   = useState<boolean>(false);
  const [showCutout,     setShowCutout]     = useState<boolean>(!!(settings?.agent_cutout_url));
  const [showSalePrice,  setShowSalePrice]  = useState<boolean>(false);
  const [includeEndCard, setIncludeEndCard] = useState<boolean>(true);

  // ── Caption ────────────────────────────────────────────────────────────────
  const [caption,       setCaption]       = useState<string>("");
  const [ctaLine,       setCtaLine]       = useState<string>("Ready to make your move? Let's connect.");
  const [extraHashtags, setExtraHashtags] = useState<string>("");

  // ── Property photos ────────────────────────────────────────────────────────
  const [photoUrls,      setPhotoUrls]      = useState<Record<string, string>>({});
  const [cropFile,       setCropFile]       = useState<File | null>(null);
  const [cropTxId,       setCropTxId]       = useState<string | null>(null);
  const [cropOpen,       setCropOpen]       = useState(false);
  const [uploadingPhoto,   setUploadingPhoto]   = useState<string | null>(null);
  const [uploadingCutout,  setUploadingCutout]  = useState(false);
  const [removingBg,       setRemovingBg]       = useState(false);
  const [bgError,          setBgError]          = useState<string | null>(null);
  const photoInputRef  = useRef<HTMLInputElement>(null);
  const cutoutInputRef = useRef<HTMLInputElement>(null);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [currentSlide,   setCurrentSlide]   = useState<number>(0);
  const [copied,         setCopied]         = useState<boolean>(false);
  const [downloading,    setDownloading]    = useState<boolean>(false);
  const [exporting,      setExporting]      = useState<boolean>(false);
  const [publishing,     setPublishing]     = useState<boolean>(false);
  const [publishResult,  setPublishResult]  = useState<{ success: boolean; message: string } | null>(null);
  // Track slide URLs that have failed to load. A URL-keyed Set means stale
  // errors are automatically abandoned when URLs regenerate on config changes.
  const [slideErrors, setSlideErrors] = useState<Set<string>>(new Set());

  // ── Derived values ─────────────────────────────────────────────────────────
  const agentName    = settings?.display_name                              ?? "Your Agent";
  const businessName = settings?.business_name || settings?.brokerage_name || "";
  const monthLabel   = MONTH_NAMES[selectedMonth - 1];

  // Filter closed transactions for the selected month
  const monthTx = transactions.filter((tx) => {
    const d = new Date(tx.date);
    return (d.getMonth() + 1) === selectedMonth && d.getFullYear() === selectedYear;
  });

  const selectedTx = monthTx.filter((tx) => selectedIds.has(tx.id));

  // ── Build PostConfig ───────────────────────────────────────────────────────
  const config: PostConfig = {
    postType:       "month-in-review",
    month:          selectedMonth,
    year:           selectedYear,
    templateFamily,
    agentName,
    businessName,
    logoUrl,
    headshotUrl,
    cutoutUrl,
    soldWording,
    showLogo,
    showHeadshot,
    showCutout,
    showSalePrice,
    includeEndCard,
    ctaLine,
    extraHashtags,
  };

  // ── Build slides ───────────────────────────────────────────────────────────
  const slides = buildSlides(config, selectedTx);
  const safeSlide = Math.min(currentSlide, Math.max(0, slides.length - 1));
  const currentSlideSpec = slides[safeSlide];

  // ── Slide URL builder ──────────────────────────────────────────────────────
  // Session-unique cache buster: prevents browsers from serving stale cached
  // empty responses from previous Edge function timeouts. Stable within the
  // session so subsequent renders reuse the same URLs for img caching.
  const sessionCb = useRef(Date.now()).current;
  const slideUrl = useCallback(
    (spec: SlideSpec) => buildSlideApiUrl(spec, config, photoUrls) + `&_v=${sessionCb}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateFamily, agentName, businessName, logoUrl, headshotUrl, cutoutUrl,
     selectedMonth, selectedYear, soldWording, showLogo, showHeadshot, showCutout,
     showSalePrice, includeEndCard, ctaLine, selectedTx.length, photoUrls, sessionCb],
  );

  // ── Auto-select all transactions when month changes ────────────────────────
  useEffect(() => {
    setSelectedIds(new Set(monthTx.map((tx) => tx.id)));
    setCurrentSlide(0);
    setSlideErrors(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear]);

  // ── Clear slide errors when template family changes ──────────────────────
  // Without this, cached/stale error states from a previous template persist.
  useEffect(() => {
    setSlideErrors(new Set());
  }, [templateFamily]);

  // ── Auto-generate caption ──────────────────────────────────────────────────
  useEffect(() => {
    if (selectedTx.length > 0) {
      setCaption(generateCaption(config, selectedTx));
    } else {
      setCaption("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectedMonth, selectedYear, ctaLine, extraHashtags]);

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (!settings) {
    return (
      <div className="py-20 text-center text-muted-foreground">Settings not found.</div>
    );
  }

  // ── Toggle transaction ─────────────────────────────────────────────────────
  function toggleTx(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
    setCurrentSlide(0);
  }

  // ── Photo upload handlers ──────────────────────────────────────────────────
  function handlePhotoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !cropTxId) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Photo must be under 5 MB");
      e.target.value = "";
      return;
    }
    setCropFile(file);
    setCropOpen(true);
    e.target.value = ""; // reset so same file can be re-selected
  }

  async function handlePhotoCropped(blob: Blob) {
    if (!cropTxId || !user) return;
    const txId = cropTxId;
    setCropOpen(false);
    setCropFile(null);
    setCropTxId(null);
    setUploadingPhoto(txId);

    try {
      const ext = blob.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/social/${txId}.${ext}`;
      const { error } = await supabase.storage
        .from("profile-media")
        .upload(path, blob, { upsert: true, contentType: blob.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from("profile-media")
        .getPublicUrl(path);
      // Cache-bust so the preview img tag refetches
      setPhotoUrls((prev) => ({ ...prev, [txId]: `${publicUrl}?t=${Date.now()}` }));
    } catch (err) {
      console.error("Photo upload failed:", err);
      alert("Photo upload failed — please try again.");
    } finally {
      setUploadingPhoto(null);
    }
  }

  function removePhoto(txId: string) {
    setPhotoUrls((prev) => {
      const next = { ...prev };
      delete next[txId];
      return next;
    });
  }

  // ── Cutout upload handler ────────────────────────────────────────────────
  async function handleCutoutUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Cutout photo must be under 5 MB");
      e.target.value = "";
      return;
    }
    setUploadingCutout(true);
    try {
      const path = `${user.id}/cutout.png`;
      const { error } = await supabase.storage
        .from("profile-media")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from("profile-media")
        .getPublicUrl(path);
      setCutoutUrl(`${publicUrl}?t=${Date.now()}`);
      // Persist clean URL to DB so it auto-fills next session
      await supabase
        .from("user_settings")
        .update({ agent_cutout_url: publicUrl })
        .eq("user_id", user.id);
    } catch (err) {
      console.error("Cutout upload failed:", err);
      alert("Cutout upload failed — please try again.");
    } finally {
      setUploadingCutout(false);
      if (e.target) e.target.value = "";
    }
  }

  // ── Remove background from cutout (client-side WASM) ─────────────────────
  // The cutout is rendered at ≤380 px tall on 1080×1080 slides, so we cap at
  // 1024 px on the longest side. This keeps the PNG well under the 5 MB
  // Supabase bucket limit while staying sharp on Retina displays.
  async function handleRemoveBackground() {
    if (!cutoutUrl || !user) return;
    setRemovingBg(true);
    setBgError(null);
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const imgRes  = await fetch(cutoutUrl);
      if (!imgRes.ok) throw new Error(`Failed to fetch image (${imgRes.status})`);
      const imgBlob = await imgRes.blob();
      const resultBlob = await removeBackground(imgBlob, {
        output: { format: "image/png" },
      });

      // ── Resize to max 1024 px on longest side ──────────────────────────
      const bmp = await createImageBitmap(resultBlob);
      const MAX = 1024;
      let w = bmp.width;
      let h = bmp.height;
      if (w > MAX || h > MAX) {
        const scale = MAX / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const resizedBlob = await canvas.convertToBlob({ type: "image/png" });

      const path = `${user.id}/cutout.png`;
      const { error } = await supabase.storage
        .from("profile-media")
        .upload(path, resizedBlob, { upsert: true, contentType: "image/png" });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from("profile-media")
        .getPublicUrl(path);
      setCutoutUrl(`${publicUrl}?t=${Date.now()}`);
      await supabase
        .from("user_settings")
        .update({ agent_cutout_url: publicUrl })
        .eq("user_id", user.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Background removal failed:", err);
      setBgError(msg);
    } finally {
      setRemovingBg(false);
    }
  }

  // ── Copy caption ───────────────────────────────────────────────────────────
  async function handleCopy() {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Download ZIP (Quick Post) ──────────────────────────────────────────────
  async function handleDownload() {
    if (!selectedTx.length) return;
    setDownloading(true);
    try {
      const zip    = new JSZip();
      const folder = zip.folder(`${monthLabel}-${selectedYear}-slides`);
      for (let i = 0; i < slides.length; i++) {
        const spec = slides[i];
        const res  = await fetch(slideUrl(spec));
        if (!res.ok) throw new Error(`Slide ${i + 1} failed`);
        folder?.file(`slide-${String(i + 1).padStart(2, "0")}-${spec.type}.png`, await res.blob());
      }
      const blob   = await zip.generateAsync({ type: "blob" });
      const objUrl = URL.createObjectURL(blob);
      const a      = Object.assign(document.createElement("a"), { href: objUrl, download: `agent-runway-${monthLabel.toLowerCase()}-${selectedYear}.zip` });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) { console.error("Download failed:", err); toast.error("Download failed — please try again."); }
    finally { setDownloading(false); }
  }

  // ── Canva Export ZIP ───────────────────────────────────────────────────────
  async function handleCanvaExport() {
    if (!selectedTx.length) return;
    setExporting(true);
    try {
      const zip    = new JSZip();
      const folder = zip.folder(`agent-runway-canva-${monthLabel.toLowerCase()}-${selectedYear}`);
      // Slide PNGs
      for (let i = 0; i < slides.length; i++) {
        const spec = slides[i];
        const res  = await fetch(slideUrl(spec));
        if (!res.ok) throw new Error(`Slide ${i + 1} failed`);
        folder?.file(`slide-${String(i + 1).padStart(2, "0")}-${spec.type}.png`, await res.blob());
      }
      // Caption text
      folder?.file("caption.txt", caption);
      // Structured content JSON
      folder?.file("content.json", buildCanvaContentJson(config, selectedTx));
      // Instructions
      folder?.file("canva-instructions.md", buildCanvaInstructions(config));

      const blob   = await zip.generateAsync({ type: "blob" });
      const objUrl = URL.createObjectURL(blob);
      const a      = Object.assign(document.createElement("a"), { href: objUrl, download: `agent-runway-canva-${monthLabel.toLowerCase()}-${selectedYear}.zip` });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) { console.error("Canva export failed:", err); toast.error("Canva export failed — please try again."); }
    finally { setExporting(false); }
  }

  // ── Post to Instagram ──────────────────────────────────────────────────────
  async function handlePublish() {
    if (!selectedTx.length) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const siteBase       = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const slideAbsUrls   = slides.map((spec) => `${siteBase}${slideUrl(spec)}`);
      const res            = await fetch("/api/social/publish", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          slideUrls:      slideAbsUrls,
          caption,
          month:          selectedMonth,
          year:           selectedYear,
          templateStyle:  templateFamily,
          transactionIds: Array.from(selectedIds),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Publishing failed");
      setPublishResult({ success: true, message: "Posted to Instagram!" });
    } catch (err) {
      setPublishResult({ success: false, message: err instanceof Error ? err.message : "Publishing failed" });
    } finally { setPublishing(false); }
  }

  // ── Misc derived ───────────────────────────────────────────────────────────
  const currentYear    = now.getFullYear();
  const years          = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  // Pre-compute the current slide URL so it's consistent across key, src, and status lookup
  const currentSlideUrl = currentSlideSpec ? slideUrl(currentSlideSpec) : null;

  const igConn     = connections.find((c) => c.platform === "instagram");
  const fbConn     = connections.find((c) => c.platform === "facebook");
  const metaAppId  = process.env.NEXT_PUBLIC_META_APP_ID;
  const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentrunway.ca";
  const igAuthUrl  = metaAppId
    ? `https://www.instagram.com/oauth/authorize?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(`${siteUrl}/api/auth/meta/callback`)}&scope=instagram_business_basic,instagram_business_content_publish&response_type=code`
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Social Media Studio
            <Badge variant="outline" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              Beta
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate polished Month in Review carousels from your closed deals
          </p>
        </div>
        {/* Connection badges */}
        <div className="flex items-center gap-2">
          {igConn ? (
            <Badge variant="outline">
              <Instagram className="h-3 w-3 mr-1" />@{igConn.account_name ?? "Connected"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground border-dashed">
              <Instagram className="h-3 w-3 mr-1" />Not connected
            </Badge>
          )}
          {fbConn ? (
            <Badge variant="outline">
              <Facebook className="h-3 w-3 mr-1" />{fbConn.account_name ?? "Connected"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground border-dashed">
              <Facebook className="h-3 w-3 mr-1" />Not connected
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">

        {/* ══ LEFT PANEL ════════════════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* 1 ── Post Setup: month + deals ─────────────────────────────── */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">1 — Post Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Month / Year pickers */}
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-lg border border-slate-200 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  className="w-[96px] rounded-lg border border-slate-200 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {/* Deal picker */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-slate-700">
                    {monthTx.length} closed deal{monthTx.length !== 1 ? "s" : ""} in {monthLabel}
                  </p>
                  {monthTx.length > 0 && (
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => {
                        setSelectedIds(
                          selectedIds.size === monthTx.length
                            ? new Set()
                            : new Set(monthTx.map((t) => t.id)),
                        );
                        setCurrentSlide(0);
                      }}
                    >
                      {selectedIds.size === monthTx.length ? "Deselect all" : "Select all"}
                    </button>
                  )}
                </div>

                {monthTx.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No closed deals in {monthLabel} {selectedYear}. Try a different month.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {monthTx.map((tx) => {
                      const gci        = computeGCI(tx);
                      const isSelected = selectedIds.has(tx.id);
                      const hasPhoto   = !!photoUrls[tx.id];
                      const isUploading = uploadingPhoto === tx.id;
                      return (
                        <div key={tx.id} className="space-y-1">
                          <button
                            onClick={() => toggleTx(tx.id)}
                            className={`w-full flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs transition-all ${
                              isSelected ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300 bg-white"
                            }`}
                          >
                            <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                              {isSelected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-900 truncate">{tx.address || "Address TBD"}</div>
                              <div className="text-slate-500 mt-0.5 flex items-center gap-1.5">
                                <span className="capitalize">{tx.side}</span>
                                <span>·</span>
                                <span className="font-medium text-emerald-700">{fmtCurrency(gci)}</span>
                              </div>
                            </div>
                          </button>

                          {/* Photo upload row — visible when deal is selected */}
                          {isSelected && (
                            <div className="ml-6 flex items-center gap-2">
                              {hasPhoto ? (
                                <>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={photoUrls[tx.id]}
                                    alt="Property"
                                    className="h-10 w-10 rounded border border-slate-200 object-cover"
                                  />
                                  <span className="text-[11px] text-emerald-600 font-medium">Photo added</span>
                                  <button
                                    onClick={() => removePhoto(tx.id)}
                                    className="text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                                    title="Remove photo"
                                  >
                                    <XIcon className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setCropTxId(tx.id);
                                      photoInputRef.current?.click();
                                    }}
                                    className="text-[11px] text-blue-500 hover:text-blue-700 transition-colors"
                                  >
                                    Replace
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setCropTxId(tx.id);
                                    photoInputRef.current?.click();
                                  }}
                                  disabled={isUploading}
                                  className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
                                >
                                  {isUploading ? (
                                    <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</>
                                  ) : (
                                    <><ImagePlus className="h-3 w-3" /> Add photo</>
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 2 ── Template Style ─────────────────────────────────────────── */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">2 — Template Style</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(Object.entries(TEMPLATE_FAMILIES) as [TemplateFamily, typeof TEMPLATE_FAMILIES[TemplateFamily]][]).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setTemplateFamily(key)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                    templateFamily === key
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-lg border-2 shrink-0 ${meta.previewBg} ${meta.previewBorder}`} />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{meta.label}</div>
                    <div className="text-xs text-slate-500">{meta.description}</div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* 3 ── Branding ───────────────────────────────────────────────── */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">3 — Branding</CardTitle>
              <CardDescription className="text-xs">
                Pulled from your profile — override per post if needed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Logo */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Business Logo URL</Label>
                <div className="flex gap-2 items-center">
                  {logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="logo" className="h-8 w-8 rounded border border-slate-200 object-contain bg-white shrink-0" />
                  )}
                  <Input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://… (from your profile settings)"
                    className="text-xs h-8"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <ToggleButton enabled={showLogo} onToggle={setShowLogo} label="Show logo on slides" disabled={!logoUrl} />
                </div>
              </div>

              {/* Headshot */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Agent Headshot URL</Label>
                <div className="flex gap-2 items-center">
                  {headshotUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={headshotUrl} alt="headshot" className="h-8 w-8 rounded-full border border-slate-200 object-cover shrink-0" />
                  )}
                  <Input
                    value={headshotUrl}
                    onChange={(e) => setHeadshotUrl(e.target.value)}
                    placeholder="https://… (from your profile settings)"
                    className="text-xs h-8"
                  />
                </div>
                <ToggleButton enabled={showHeadshot} onToggle={setShowHeadshot} label="Show headshot on cover + end card" disabled={!headshotUrl} />
              </div>

              {/* Agent Cutout Photo */}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Agent Cutout Photo</Label>
                <div className="flex gap-2 items-center">
                  {cutoutUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cutoutUrl} alt="cutout" className="h-10 w-8 rounded border border-slate-200 object-contain bg-slate-50 shrink-0" />
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 shrink-0"
                    disabled={uploadingCutout || removingBg}
                    onClick={() => cutoutInputRef.current?.click()}
                  >
                    {uploadingCutout ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ImagePlus className="h-3 w-3 mr-1" />}
                    {uploadingCutout ? "Uploading…" : "Upload Photo"}
                  </Button>
                  {cutoutUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 shrink-0"
                      disabled={removingBg || uploadingCutout}
                      onClick={handleRemoveBackground}
                    >
                      {removingBg
                        ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        : <Sparkles className="h-3 w-3 mr-1" />}
                      {removingBg ? "Removing…" : "Remove BG"}
                    </Button>
                  )}
                </div>
                {removingBg && (
                  <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    Removing background in your browser — first run downloads the AI model (~45 MB, cached after that)…
                  </p>
                )}
                {bgError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    Background removal failed: {bgError}
                  </p>
                )}
                <ToggleButton enabled={showCutout} onToggle={setShowCutout} label="Show cutout on property slides" disabled={!cutoutUrl} />
                <input
                  ref={cutoutInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleCutoutUpload}
                />
              </div>

              {!settings.business_logo_url && !settings.avatar_url && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Add a logo and headshot in your{" "}
                  <a href="/settings" className="underline font-medium">Profile Settings</a>{" "}
                  to have them auto-fill here.
                </p>
              )}
            </CardContent>
          </Card>

          {/* 4 ── Slide Options ───────────────────────────────────────────── */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">4 — Slide Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Sold wording */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-600">Sold Label</Label>
                <div className="flex gap-1.5">
                  {SOLD_WORDING_OPTIONS.map((w) => (
                    <button
                      key={w}
                      onClick={() => setSoldWording(w)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                        soldWording === w
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                <ToggleButton enabled={showSalePrice}  onToggle={setShowSalePrice}  label="Show sale price on property slides" />
                <ToggleButton enabled={includeEndCard} onToggle={setIncludeEndCard} label="Include end card" />
              </div>
            </CardContent>
          </Card>

          {/* Connect accounts ────────────────────────────────────────────── */}
          <Card className="rounded-xl border-dashed border-slate-200 bg-slate-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Connect Accounts
              </CardTitle>
              <CardDescription className="text-xs">
                Link your Instagram to post carousels directly from Agent Runway.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {igAuthUrl ? (
                <a
                  href={igAuthUrl}
                  className={`flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    igConn
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-pink-200 bg-white text-pink-700 hover:bg-pink-50"
                  }`}
                >
                  <Instagram className="h-3.5 w-3.5" />
                  {igConn ? (
                    <><CheckCircle className="h-3 w-3" />@{igConn.account_name} connected</>
                  ) : "Connect Instagram"}
                </a>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 mb-1">
                    <Instagram className="h-3.5 w-3.5" />
                    <span className="font-medium">Instagram</span>
                  </div>
                  <span>Instagram — coming soon</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══ RIGHT PANEL ═══════════════════════════════════════════════════ */}
        <div className="space-y-5">

          {/* Carousel preview ─────────────────────────────────────────────── */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Carousel Preview</CardTitle>
                  <CardDescription className="text-xs">
                    {slides.length} slides · 1080×1080 · Swipe-ready
                  </CardDescription>
                </div>
                {selectedTx.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Slide {safeSlide + 1} of {slides.length}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {selectedTx.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 border border-dashed border-slate-200 aspect-square max-w-[400px] mx-auto gap-3 text-center p-8">
                  <div className="text-4xl">📱</div>
                  <p className="text-sm font-medium text-slate-600">No deals selected</p>
                  <p className="text-xs text-muted-foreground">
                    Select deals in Post Setup to preview your carousel.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  {/* Main slide */}
                  <div className="relative w-full max-w-[440px] mx-auto">
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden border border-slate-200 shadow-md bg-slate-100">
                      {/* Spinner — rendered first (behind), naturally covered once the PNG paints.
                          We rely on DOM stacking order rather than onLoad so cached images
                          always display without the event-timing race condition. */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
                        <p className="text-xs text-muted-foreground">Generating…</p>
                      </div>

                      {currentSlideSpec && currentSlideUrl && (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            key={currentSlideUrl}
                            src={currentSlideUrl}
                            alt={currentSlideSpec.label}
                            className="absolute inset-0 w-full h-full object-cover"
                            onLoad={() => setSlideErrors((prev) => { const next = new Set(prev); next.delete(currentSlideUrl!); return next; })}
                            onError={() => setSlideErrors((prev) => new Set([...prev, currentSlideUrl!]))}
                          />
                          {slideErrors.has(currentSlideUrl) && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100">
                              <AlertCircle className="h-6 w-6 text-slate-400" />
                              <p className="text-xs text-muted-foreground">Preview unavailable</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {slides.length > 1 && (
                      <>
                        <button
                          onClick={() => setCurrentSlide(Math.max(0, safeSlide - 1))}
                          disabled={safeSlide === 0}
                          className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 shadow border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setCurrentSlide(Math.min(slides.length - 1, safeSlide + 1))}
                          disabled={safeSlide === slides.length - 1}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 shadow border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Dot nav */}
                  <div className="flex gap-1.5 items-center">
                    {slides.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentSlide(idx)}
                        className={`transition-all rounded-full ${idx === safeSlide ? "w-5 h-2 bg-blue-600" : "w-2 h-2 bg-slate-300 hover:bg-slate-400"}`}
                      />
                    ))}
                  </div>

                  {/* Thumbnail strip */}
                  <div className="w-full overflow-x-auto">
                    <div className="flex gap-2 pb-2" style={{ minWidth: "max-content" }}>
                      {slides.map((spec, idx) => {
                        const thumbUrl = slideUrl(spec);
                        return (
                          <button
                            key={`${templateFamily}-${idx}`}
                            onClick={() => setCurrentSlide(idx)}
                            className={`shrink-0 rounded-lg overflow-hidden border-2 transition-all ${idx === safeSlide ? "border-blue-500 shadow-md" : "border-transparent hover:border-slate-300"}`}
                            style={{ width: 64, height: 64 }}
                          >
                            <div className="relative w-full h-full bg-slate-100">
                              {/* Spinner behind — covered once image paints */}
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-3 w-3 text-slate-400 animate-spin" />
                              </div>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={thumbUrl}
                                alt={spec.label}
                                className="absolute inset-0 w-full h-full object-cover"
                                onLoad={() => setSlideErrors((prev) => { const next = new Set(prev); next.delete(thumbUrl); return next; })}
                                onError={() => setSlideErrors((prev) => new Set([...prev, thumbUrl]))}
                              />
                              {slideErrors.has(thumbUrl) && (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                                  <AlertCircle className="h-4 w-4 text-slate-400" />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Caption ─────────────────────────────────────────────────────── */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Caption
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Auto-generated — edit freely before posting
                  </CardDescription>
                </div>
                <button
                  onClick={() => setCaption(generateCaption(config, selectedTx))}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-slate-700 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />Regenerate
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={9}
                className="resize-none text-sm font-mono leading-relaxed"
                placeholder="Select deals above to generate a caption…"
              />
              {/* CTA override */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Custom CTA line (updates caption)</Label>
                <Input
                  value={ctaLine}
                  onChange={(e) => setCtaLine(e.target.value)}
                  placeholder="Ready to make your move? Let's connect."
                  className="text-xs h-8"
                />
              </div>
              {/* Hashtag override */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Extra hashtags (optional)</Label>
                <Input
                  value={extraHashtags}
                  onChange={(e) => setExtraHashtags(e.target.value)}
                  placeholder="#YourCity #YourNeighbourhood"
                  className="text-xs h-8"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={!caption}
                className="gap-1.5"
              >
                {copied ? (
                  <><Check className="h-3.5 w-3.5 text-emerald-600" />Copied!</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" />Copy Caption</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Quick Post ──────────────────────────────────────────────────── */}
          <Card className="rounded-xl border-blue-200 bg-blue-50/40 shadow-sm">
            <CardContent className="pt-5 space-y-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quick Post</div>

              {/* Post to Instagram */}
              {igConn?.account_id ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-pink-200 bg-white p-4">
                  <div>
                    <div className="font-semibold text-slate-900 mb-0.5 flex items-center gap-2">
                      <Instagram className="h-4 w-4 text-pink-500" />
                      Post to Instagram
                    </div>
                    <div className="text-sm text-slate-500">
                      Publish directly to @{igConn.account_name} with your caption
                    </div>
                  </div>
                  <Button
                    size="lg"
                    onClick={handlePublish}
                    disabled={!selectedTx.length || publishing || publishResult?.success === true}
                    className="shrink-0 gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white"
                  >
                    {publishing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Publishing…</>
                    ) : publishResult?.success ? (
                      <><CheckCircle className="h-4 w-4" />Posted!</>
                    ) : (
                      <><Send className="h-4 w-4" />Post to Instagram</>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-pink-200 bg-white p-4 text-sm text-slate-600">
                  <Instagram className="h-5 w-5 text-pink-400 shrink-0" />
                  <div>
                    <span className="font-medium text-slate-900">Connect Instagram to post directly.</span>
                    {" "}Use the Connect Accounts panel to link your account.
                  </div>
                </div>
              )}

              {/* Publish feedback */}
              {publishResult && (
                <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${publishResult.success ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                  {publishResult.success
                    ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                    : <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />}
                  {publishResult.message}
                </div>
              )}

              {/* Download slides ZIP */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900 text-sm">Download Slides</div>
                  <div className="text-xs text-slate-500">
                    {selectedTx.length === 0 ? "Select deals to generate slides" : `${slides.length} slides · ZIP · 1080×1080 PNG`}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={!selectedTx.length || downloading}
                  className="gap-2 shrink-0"
                >
                  {downloading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : <><Download className="h-4 w-4" />Download ZIP</>}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Canva Export ────────────────────────────────────────────────── */}
          <Card className="rounded-xl border-violet-200 bg-violet-50/30 shadow-sm">
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Canva Finishing Mode</div>
                  <div className="font-medium text-slate-900 text-sm flex items-center gap-2">
                    <Package className="h-4 w-4 text-violet-500" />
                    Export for Canva
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {selectedTx.length === 0
                      ? "Select deals first"
                      : "Slides + caption + content file + setup guide"}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCanvaExport}
                  disabled={!selectedTx.length || exporting}
                  className="gap-2 shrink-0 border-violet-300 text-violet-700 hover:bg-violet-50"
                >
                  {exporting ? <><Loader2 className="h-4 w-4 animate-spin" />Exporting…</> : <><Package className="h-4 w-4" />Export for Canva</>}
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-3 border-t border-violet-100 pt-3">
                Package includes all slide PNGs, your caption, structured content data, and a Canva finishing guide — for when you want full design control.
              </p>
            </CardContent>
          </Card>

          {/* Tips ────────────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-5 py-4 text-xs text-muted-foreground space-y-2">
            <p className="font-semibold text-slate-700">📸 Tips for best results</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Post Tuesday–Thursday, 9–11am or 6–8pm for highest reach</li>
              <li>Add a property photo to each deal — click &ldquo;Add photo&rdquo; next to each listing</li>
              <li>Tag your brokerage and city accounts for wider amplification</li>
              <li>Reply to comments within the first hour — it signals the algorithm</li>
              <li>Add location to your post to appear in local explore feeds</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Hidden file input for property photos */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePhotoFileSelected}
      />

      {/* Crop modal */}
      <PhotoCropDialog
        open={cropOpen}
        onOpenChange={(open: boolean) => {
          setCropOpen(open);
          if (!open) { setCropFile(null); setCropTxId(null); }
        }}
        imageFile={cropFile}
        onCropComplete={handlePhotoCropped}
      />
    </div>
  );
}

// ── Toggle button helper ──────────────────────────────────────────────────────

function ToggleButton({
  enabled,
  onToggle,
  label,
  disabled = false,
}: {
  enabled:  boolean;
  onToggle: (v: boolean) => void;
  label:    string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onToggle(!enabled)}
      className={`flex items-center gap-2 text-xs transition-colors ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {enabled && !disabled ? (
        <ToggleRight className="h-4 w-4 text-blue-600" />
      ) : (
        <ToggleLeft className="h-4 w-4 text-slate-400" />
      )}
      <span className={enabled && !disabled ? "text-slate-800 font-medium" : "text-slate-500"}>
        {label}
      </span>
    </button>
  );
}
