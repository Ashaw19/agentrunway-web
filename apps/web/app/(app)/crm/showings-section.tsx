"use client";

/**
 * ShowingsSection — rendered inside the CRM client detail panel.
 * Shows a list of properties shown to the client, with the ability to:
 * - Log a new showing (manual entry or screenshot upload)
 * - Rate & take notes on each showing
 * - View AI-extracted property data
 * - Run Buyer DNA analysis (4+ showings)
 * - Run MLS Cut Sheet / Property Analysis
 */

import { useState, useCallback, useRef } from "react";
import { markMemoryStaleClient } from "@/lib/ai/mark-memory-stale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Home,
  Plus,
  Camera,
  Star,
  TrendingUp,
  Brain,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  DollarSign,
  Bed,
  Bath,
  Ruler,
  FileSearch,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { PropertyShowing, BuyerDNA } from "@/lib/types/database";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string;
  clientName: string;
  showings: PropertyShowing[];
  onShowingsChange: (updated: PropertyShowing[]) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number | null): string {
  if (!n) return "—";
  return `$${n.toLocaleString()}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STAR_LABELS = ["", "Not interested", "Below average", "Average", "Good fit", "Top pick"];

// ── Component ────────────────────────────────────────────────────────────────

export function ShowingsSection({ clientId, clientName, showings, onShowingsChange }: Props) {
  // ── State ────────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState(showings.length > 0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add form fields
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [showingDate, setShowingDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [listingPrice, setListingPrice] = useState("");
  const [propertyType, setPropertyType] = useState("detached");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [sqft, setSqft] = useState("");
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [realtorUrl, setRealtorUrl] = useState("");
  const [mlsNumber, setMlsNumber] = useState("");

  // Screenshot extraction
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Buyer DNA
  const [buyerDNA, setBuyerDNA] = useState<BuyerDNA | null>(null);
  const [dnaLoading, setDnaLoading] = useState(false);
  const [dnaExpanded, setDnaExpanded] = useState(false);

  // Property Analysis
  const [analysisLoading, setAnalysisLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const analysisFileRef = useRef<HTMLInputElement>(null);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setAddress("");
    setCity("");
    setShowingDate(new Date().toISOString().split("T")[0]);
    setListingPrice("");
    setPropertyType("detached");
    setBedrooms("");
    setBathrooms("");
    setSqft("");
    setRating(0);
    setNotes("");
    setRealtorUrl("");
    setMlsNumber("");
    setShowAddForm(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!address.trim()) {
      toast.error("Property address is required");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("property_showings")
        .insert({
          client_id:        clientId,
          property_address:  address.trim(),
          city:              city.trim() || null,
          showing_date:      showingDate,
          listing_price:     listingPrice ? parseFloat(listingPrice.replace(/[^0-9.]/g, "")) : null,
          property_type:     propertyType,
          bedrooms:          bedrooms ? parseInt(bedrooms) : null,
          bathrooms:         bathrooms ? parseFloat(bathrooms) : null,
          square_feet:       sqft ? parseInt(sqft.replace(/[^0-9]/g, "")) : null,
          client_rating:     rating || null,
          notes:             notes.trim() || null,
          realtor_ca_url:    realtorUrl.trim() || null,
          mls_number:        mlsNumber.trim() || null,
        })
        .select("*")
        .single();

      if (error) throw error;
      onShowingsChange([data as PropertyShowing, ...showings]);
      markMemoryStaleClient(clientId);
      toast.success("Showing logged");
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save showing");
    } finally {
      setSaving(false);
    }
  }, [address, city, showingDate, listingPrice, propertyType, bedrooms, bathrooms, sqft, rating, notes, realtorUrl, mlsNumber, clientId, showings, onShowingsChange, resetForm]);

  // Screenshot extraction
  const handleScreenshot = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      return;
    }
    setExtracting(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/ai/extract-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });
      if (!res.ok) throw new Error("Extraction failed");
      const { extracted } = await res.json();

      // Auto-fill form fields
      if (extracted.property_address) setAddress(extracted.property_address);
      if (extracted.city) setCity(extracted.city);
      if (extracted.listing_price) setListingPrice(String(extracted.listing_price));
      if (extracted.property_type) setPropertyType(extracted.property_type);
      if (extracted.bedrooms) setBedrooms(String(extracted.bedrooms));
      if (extracted.bathrooms) setBathrooms(String(extracted.bathrooms));
      if (extracted.square_feet) setSqft(String(extracted.square_feet));
      if (extracted.mls_number) setMlsNumber(extracted.mls_number);

      toast.success("Property details extracted from screenshot");
    } catch {
      toast.error("Could not extract property details — fill manually");
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  // Buyer DNA analysis
  const handleBuyerDNA = useCallback(async () => {
    setDnaLoading(true);
    try {
      const res = await fetch("/api/ai/buyer-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }
      const dna = await res.json();
      setBuyerDNA(dna);
      setDnaExpanded(true);
      toast.success("Buyer DNA analysis complete");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDnaLoading(false);
    }
  }, [clientId]);

  // Property / MLS analysis
  const handlePropertyAnalysis = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      return;
    }
    setAnalysisLoading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/ai/property-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, clientId }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      const result = await res.json();
      setAnalysisResult(result);
      setAnalysisExpanded(true);
      toast.success("Property analysis complete");
    } catch {
      toast.error("Could not analyze property");
    } finally {
      setAnalysisLoading(false);
      if (analysisFileRef.current) analysisFileRef.current.value = "";
    }
  }, [clientId]);

  // Delete showing
  const handleDelete = useCallback(async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("property_showings").delete().eq("id", id);
    if (error) {
      toast.error("Failed to remove showing");
      return;
    }
    onShowingsChange(showings.filter((s) => s.id !== id));
    toast.success("Showing removed");
  }, [showings, onShowingsChange]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="h-3.5 w-3.5" />
          Showings ({showings.length})
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <div className="flex gap-1">
          {showings.length >= 3 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-6 text-[10px]"
              onClick={handleBuyerDNA}
              disabled={dnaLoading}
            >
              {dnaLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
              Buyer DNA
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1 h-6 text-[10px]"
            onClick={() => {
              setShowAddForm(true);
              setExpanded(true);
            }}
          >
            <Plus className="h-3 w-3" />
            Log Showing
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3">
          {/* ── Buyer DNA card ───────────────────────────────────────── */}
          {buyerDNA && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 space-y-2">
              <button
                onClick={() => setDnaExpanded(!dnaExpanded)}
                className="flex items-center gap-2 w-full text-left"
              >
                <Sparkles className="h-4 w-4 text-violet-400" />
                <span className="text-xs font-semibold text-violet-300">
                  Buyer DNA — {clientName}
                </span>
                {dnaExpanded ? <ChevronUp className="h-3 w-3 text-violet-400 ml-auto" /> : <ChevronDown className="h-3 w-3 text-violet-400 ml-auto" />}
              </button>

              {dnaExpanded && (
                <div className="space-y-3 pt-1">
                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-background/50 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Avg Price</p>
                      <p className="text-sm font-bold tabular-nums">{fmtPrice(buyerDNA.avg_price)}</p>
                    </div>
                    <div className="rounded-lg bg-background/50 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Preferred</p>
                      <p className="text-sm font-bold capitalize">{buyerDNA.preferred_type}</p>
                    </div>
                    <div className="rounded-lg bg-background/50 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Budget</p>
                      <p className="text-sm font-bold flex items-center justify-center gap-0.5">
                        {buyerDNA.budget_drift === "increasing" && <TrendingUp className="h-3 w-3 text-amber-400" />}
                        {buyerDNA.budget_drift === "decreasing" && <TrendingUp className="h-3 w-3 text-emerald-400 rotate-180" />}
                        <span className="capitalize">{buyerDNA.budget_drift}</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-background/50 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Avg Bed/Bath</p>
                      <p className="text-sm font-bold tabular-nums">{buyerDNA.avg_bedrooms}/{buyerDNA.avg_bathrooms}</p>
                    </div>
                    <div className="rounded-lg bg-background/50 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Avg Sqft</p>
                      <p className="text-sm font-bold tabular-nums">{buyerDNA.avg_sqft.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-background/50 p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">Pace</p>
                      <p className="text-sm font-bold tabular-nums">{buyerDNA.viewing_velocity}/wk</p>
                    </div>
                  </div>

                  {buyerDNA.preferred_areas.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                      {buyerDNA.preferred_areas.map((area) => (
                        <span key={area} className="text-[10px] bg-violet-500/10 text-violet-300 rounded-full px-2 py-0.5 font-medium">
                          {area}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* AI summary */}
                  {buyerDNA.ai_summary && (
                    <div className="rounded-lg bg-background/50 p-2.5">
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {buyerDNA.ai_summary}
                      </p>
                    </div>
                  )}

                  <p className="text-[9px] text-muted-foreground/50 text-center">
                    Based on {buyerDNA.total_showings} showings ({fmtDate(buyerDNA.date_range[0])} – {fmtDate(buyerDNA.date_range[1])})
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Property Analysis result ─────────────────────────────── */}
          {analysisResult && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
              <button
                onClick={() => setAnalysisExpanded(!analysisExpanded)}
                className="flex items-center gap-2 w-full text-left"
              >
                <FileSearch className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">
                  Property Analysis
                  {analysisResult.property_data?.address && ` — ${analysisResult.property_data.address}`}
                </span>
                {analysisExpanded ? <ChevronUp className="h-3 w-3 text-amber-400 ml-auto" /> : <ChevronDown className="h-3 w-3 text-amber-400 ml-auto" />}
              </button>

              {analysisExpanded && analysisResult.analysis && (
                <div className="space-y-2.5 pt-1">
                  {analysisResult.analysis.summary && (
                    <div className="rounded-lg bg-background/50 p-2.5 border-l-2 border-amber-400">
                      <p className="text-[11px] font-medium text-foreground leading-relaxed">
                        {analysisResult.analysis.summary}
                      </p>
                    </div>
                  )}

                  {analysisResult.analysis.pricing_assessment && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Pricing Assessment
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {analysisResult.analysis.pricing_assessment}
                      </p>
                    </div>
                  )}

                  {analysisResult.analysis.offer_strategy && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> Offer Strategy
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {analysisResult.analysis.offer_strategy}
                      </p>
                    </div>
                  )}

                  {analysisResult.analysis.leverage_tips?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">Leverage Tips</p>
                      <ul className="space-y-0.5">
                        {analysisResult.analysis.leverage_tips.map((tip: string, i: number) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                            <span className="text-amber-400 mt-0.5">•</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysisResult.analysis.risk_factors?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Risk Factors</p>
                      <ul className="space-y-0.5">
                        {analysisResult.analysis.risk_factors.map((risk: string, i: number) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                            <span className="text-red-400 mt-0.5">⚠</span>
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysisResult.analysis.market_comparison && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">Market Context</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {analysisResult.analysis.market_comparison}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── MLS analysis upload button ──────────────────────────── */}
          <div className="flex gap-1.5">
            <input
              ref={analysisFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePropertyAnalysis}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1 h-6 text-[10px]"
              onClick={() => analysisFileRef.current?.click()}
              disabled={analysisLoading}
            >
              {analysisLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSearch className="h-3 w-3" />}
              Analyze MLS Sheet
            </Button>
          </div>

          {/* ── Add showing form ─────────────────────────────────────── */}
          {showAddForm && (
            <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Home className="h-4 w-4" />
                    Log a Showing
                  </DialogTitle>
                  <DialogDescription>
                    Record a property shown to {clientName}. Use the camera button to auto-fill from a screenshot.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 pt-1">
                  {/* Screenshot extract button */}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleScreenshot}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 w-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={extracting}
                    >
                      {extracting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Extracting property details…
                        </>
                      ) : (
                        <>
                          <Camera className="h-3.5 w-3.5" />
                          Upload Screenshot to Auto-Fill
                        </>
                      )}
                    </Button>
                  </div>

                  <Separator />

                  {/* Address + City */}
                  <div className="space-y-1">
                    <Label className="text-xs">Property Address *</Label>
                    <Input
                      placeholder="e.g. 142 Elm Drive"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">City</Label>
                      <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Showing Date</Label>
                      <Input type="date" value={showingDate} onChange={(e) => setShowingDate(e.target.value)} className="h-8 text-sm" />
                    </div>
                  </div>

                  {/* Price + Type */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Listing Price</Label>
                      <Input placeholder="$599,000" value={listingPrice} onChange={(e) => setListingPrice(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Property Type</Label>
                      <Select value={propertyType} onValueChange={setPropertyType}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="detached">Detached</SelectItem>
                          <SelectItem value="semi">Semi-Detached</SelectItem>
                          <SelectItem value="townhouse">Townhouse</SelectItem>
                          <SelectItem value="condo">Condo</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Bed / Bath / Sqft */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="showing-bedrooms" className="text-xs">Bedrooms</Label>
                      <Input id="showing-bedrooms" placeholder="3" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="showing-bathrooms" className="text-xs">Bathrooms</Label>
                      <Input id="showing-bathrooms" placeholder="2.5" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="showing-sqft" className="text-xs">Sqft</Label>
                      <Input id="showing-sqft" placeholder="1,800" value={sqft} onChange={(e) => setSqft(e.target.value)} className="h-8 text-sm" />
                    </div>
                  </div>

                  {/* MLS + Realtor URL */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="showing-mls" className="text-xs">MLS #</Label>
                      <Input id="showing-mls" placeholder="W5012345" value={mlsNumber} onChange={(e) => setMlsNumber(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="showing-realtor-url" className="text-xs">Realtor.ca Link</Label>
                      <Input id="showing-realtor-url" placeholder="https://..." value={realtorUrl} onChange={(e) => setRealtorUrl(e.target.value)} className="h-8 text-sm" />
                    </div>
                  </div>

                  {/* Rating */}
                  <div className="space-y-1">
                    <Label className="text-xs">Client Rating</Label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRating(rating === star ? 0 : star)}
                          className="p-0.5 transition-colors"
                        >
                          <Star
                            className={`h-5 w-5 ${
                              star <= rating
                                ? "text-amber-400 fill-amber-400"
                                : "text-muted-foreground/30"
                            }`}
                          />
                        </button>
                      ))}
                      {rating > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-1.5">
                          {STAR_LABELS[rating]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      placeholder="Client loved the backyard but concerned about the kitchen layout…"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="text-sm resize-none"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
                  <Button size="sm" disabled={saving || !address.trim()} onClick={handleSave}>
                    {saving ? "Saving…" : "Save Showing"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* ── Showings list ───────────────────────────────────────── */}
          {showings.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">
              No showings logged yet. Track homes you show to this client.
            </p>
          ) : (
            <div className="space-y-1.5">
              {showings.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-border/50 bg-muted/20 p-2.5 space-y-1.5 group hover:border-border transition-colors"
                >
                  {/* Top row: address + price */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {s.property_address}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {s.city && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{s.city}</span>}
                        <span>{fmtDate(s.showing_date)}</span>
                        {s.property_type && <span className="capitalize">{s.property_type}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {s.listing_price && (
                        <p className="text-sm font-bold tabular-nums text-foreground">
                          {fmtPrice(s.listing_price)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {s.bedrooms && (
                      <span className="flex items-center gap-0.5"><Bed className="h-2.5 w-2.5" />{s.bedrooms} bed</span>
                    )}
                    {s.bathrooms && (
                      <span className="flex items-center gap-0.5"><Bath className="h-2.5 w-2.5" />{s.bathrooms} bath</span>
                    )}
                    {s.square_feet && (
                      <span className="flex items-center gap-0.5"><Ruler className="h-2.5 w-2.5" />{s.square_feet.toLocaleString()} sqft</span>
                    )}
                    {s.mls_number && (
                      <span>MLS: {s.mls_number}</span>
                    )}
                  </div>

                  {/* Rating + notes */}
                  <div className="flex items-center gap-2">
                    {s.client_rating && (
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3 w-3 ${
                              i < s.client_rating!
                                ? "text-amber-400 fill-amber-400"
                                : "text-muted-foreground/20"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                    {s.notes && (
                      <p className="text-[10px] text-muted-foreground truncate flex-1">
                        {s.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {s.realtor_ca_url && (
                      <a
                        href={s.realtor_ca_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        Listing
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors ml-auto"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
