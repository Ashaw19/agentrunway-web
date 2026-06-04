"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { PipelineSeedData } from "./page";
import {
  computePipelineForecast,
  computePreTransactionalWeightedGCI,
} from "@/lib/engines/pipeline-forecast";
import type {
  UnifiedPipelineItem,
  UnifiedStage,
  FunnelStep,
} from "@/lib/engines/pipeline-forecast";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import {
  Layers,
  Home,
  User,
  TrendingUp,
  Target,
  BarChart3,
  ArrowRight,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { ListingAppointment, ClientStatus } from "@/lib/types/database";
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_COLORS } from "@/lib/types/database";

// ── Helpers ──────────────────────────────────────────────────────────────

const STAGE_BADGE_COLORS: Record<UnifiedStage, string> = {
  pre_qualifying: "bg-slate-100 text-slate-600 border-slate-200",
  active:         "bg-blue-50 text-blue-600 border-blue-200",
  offer:          "bg-indigo-50 text-indigo-600 border-indigo-200",
  conditional:    "bg-violet-50 text-violet-600 border-violet-200",
  firm:           "bg-emerald-50 text-emerald-600 border-emerald-200",
  closed:         "bg-green-50 text-green-600 border-green-200",
};

const STAGE_LABELS: Record<UnifiedStage, string> = {
  pre_qualifying: "Pre-qualifying",
  active:         "Active",
  offer:          "Offer",
  conditional:    "Conditional",
  firm:           "Firm",
  closed:         "Closed",
};

function sourceIcon(source: "deal" | "listing" | "buyer") {
  switch (source) {
    case "deal":    return <Layers className="h-4 w-4 text-cyan-500" />;
    case "listing": return <Home className="h-4 w-4 text-amber-500" />;
    case "buyer":   return <User className="h-4 w-4 text-teal-500" />;
  }
}

function sourceLabel(source: "deal" | "listing" | "buyer") {
  switch (source) {
    case "deal":    return "Deal";
    case "listing": return "Listing";
    case "buyer":   return "Buyer";
  }
}

function sideBadge(side: "buy" | "sell" | "both") {
  switch (side) {
    case "buy":
      return <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600">Buy</span>;
    case "sell":
      return <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-600">Sell</span>;
    case "both":
      return <span className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-600">Both</span>;
  }
}

function accuracyColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

// ── Component ────────────────────────────────────────────────────────────

export function PipelineContent({ seed }: { seed: PipelineSeedData }) {
  const result = useMemo(
    () =>
      computePipelineForecast({
        pipelineDeals: seed.pipelineDeals,
        listingAppointments: seed.listingAppointments,
        buyerClients: seed.buyerClients,
        closedTransactions: seed.closedTransactions,
        defaultCommissionPct: seed.defaultCommissionPct,
      }),
    [seed],
  );

  const _preTransactionalGCI = useMemo(
    () => computePreTransactionalWeightedGCI(result),
    [result],
  );

  const sortedItems = useMemo(
    () => [...result.items].sort((a, b) => b.weightedGCI - a.weightedGCI),
    [result],
  );

  // ── Listing Appointment CRUD ────────────────────────────────────────────
  const router = useRouter();
  const [listingDialogOpen, setListingDialogOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<ListingAppointment | null>(null);
  const [listingSaving, setListingSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const savingListingRef = useRef(false);

  const emptyListingForm = {
    property_address: "",
    appointment_date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })(),
    estimated_list_price: "",
    estimated_commission_pct: "2.5",
    actual_list_price: "",
    actual_sale_price: "",
    expected_close_date: "",
    listing_agreement_date: "",
    status: "scheduled" as "scheduled" | "active" | "sold" | "expired" | "withdrawn" | "lost",
    notes: "",
  };
  const [listingForm, setListingForm] = useState(emptyListingForm);

  const setLF = useCallback(
    (field: string, value: string) => setListingForm((prev) => ({ ...prev, [field]: value })),
    [],
  );

  const openAddListing = useCallback(() => {
    setEditingListing(null);
    const d = new Date();
    const todayLocal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    setListingForm({ ...emptyListingForm, appointment_date: todayLocal });
    setListingDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEditListing = useCallback((item: UnifiedPipelineItem) => {
    const la = seed.listingAppointments.find((a) => a.id === item.id);
    if (!la) return;
    setEditingListing(la);
    setListingForm({
      property_address: la.property_address ?? "",
      appointment_date: la.appointment_date ?? "",
      estimated_list_price: la.estimated_list_price ? String(la.estimated_list_price) : "",
      estimated_commission_pct: la.estimated_commission_pct ? String(la.estimated_commission_pct * 100) : "2.5",
      actual_list_price: la.actual_list_price ? String(la.actual_list_price) : "",
      actual_sale_price: la.actual_sale_price ? String(la.actual_sale_price) : "",
      expected_close_date: la.expected_close_date ?? "",
      listing_agreement_date: la.listing_agreement_date ?? "",
      status: la.status as typeof emptyListingForm.status,
      notes: la.notes ?? "",
    });
    setListingDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed.listingAppointments]);

  const handleSaveListing = useCallback(async () => {
    if (savingListingRef.current) return;
    if (!listingForm.property_address.trim()) {
      toast.error("Property address is required.");
      return;
    }
    const listPrice = Number(listingForm.estimated_list_price);
    if (!listingForm.estimated_list_price || !Number.isFinite(listPrice) || listPrice <= 0) {
      toast.error("Estimated list price is required.");
      return;
    }
    const commPct = Number(listingForm.estimated_commission_pct);
    if (listingForm.estimated_commission_pct !== "" && (!Number.isFinite(commPct) || commPct < 0 || commPct > 50)) {
      toast.error("Commission must be between 0% and 50%.");
      return;
    }

    savingListingRef.current = true;
    setListingSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        property_address: listingForm.property_address.trim(),
        appointment_date: listingForm.appointment_date || new Date().toISOString().slice(0, 10),
        estimated_list_price: Number(listingForm.estimated_list_price),
        estimated_commission_pct: Number(listingForm.estimated_commission_pct) / 100,
        actual_list_price: listingForm.actual_list_price ? Number(listingForm.actual_list_price) : null,
        actual_sale_price: listingForm.actual_sale_price ? Number(listingForm.actual_sale_price) : null,
        expected_close_date: listingForm.expected_close_date || null,
        listing_agreement_date: listingForm.listing_agreement_date || null,
        status: listingForm.status,
        notes: listingForm.notes.trim() || null,
      };

      if (editingListing) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { error } = await supabase
          .from("listing_appointments")
          .update(payload)
          .eq("id", editingListing.id)
          .eq("user_id", user.id);
        if (error) throw error;
        toast.success("Listing appointment updated.");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { error } = await supabase
          .from("listing_appointments")
          .insert({ ...payload, user_id: user.id });
        if (error) throw error;
        toast.success("Listing appointment added.");
      }
      setListingDialogOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Failed to save listing appointment.");
      console.error(err);
    } finally {
      savingListingRef.current = false;
      setListingSaving(false);
    }
  }, [listingForm, editingListing, router]);

  // Update a buyer client's CRM status directly from the pipeline row.
  // Picking Scheduled or Cruising removes the row from the pipeline on refresh;
  // picking In-Flight keeps it and bumps probability from 10% → 25%.
  //
  // NOTE: this write intentionally bypasses Flight Plan automation. Flight Plan
  // firing lives client-side in crm/clients-content.tsx updateClientField().
  // Pipeline status changes are reclassification actions ("park this buyer"),
  // not lifecycle events, so skipping the automation is the correct behaviour.
  // Long-term fix: move Flight Plan firing into a DB trigger so every status
  // write path behaves identically (see migration 00105 auto-promote pattern).
  const handleBuyerStatusChange = useCallback(
    async (clientId: string, newStatus: ClientStatus) => {
      setSavingStatusId(clientId);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { error } = await supabase
          .from("clients")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", clientId)
          .eq("user_id", user.id);
        if (error) throw error;
        toast.success(`Status changed to ${CLIENT_STATUS_LABELS[newStatus]}.`);
        router.refresh();
      } catch (err) {
        toast.error("Failed to update client status.");
        console.error(err);
      } finally {
        setSavingStatusId(null);
      }
    },
    [router],
  );

  const handleDeleteListing = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("listing_appointments").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
      toast.success("Listing appointment removed.");
      router.refresh();
    } catch {
      toast.error("Failed to delete listing appointment.");
    } finally {
      setDeletingId(null);
    }
  }, [router]);

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Unified view of deals, listings, and tracked buyers with
            probability-weighted GCI forecasting.
          </p>
        </div>
        <Button onClick={openAddListing} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Listing
        </Button>
      </div>

      {/* ── Stale-deal caveat ───────────────────────────────────────── */}
      {result.staleDealCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950/30 dark:border-amber-800/40 dark:text-amber-200">
          {result.staleDealCount} {result.staleDealCount === 1 ? "deal contributes" : "deals contribute"}{" "}
          {fmtCurrency(result.staleWeightedGCI)} to the weighted total but{" "}
          {result.staleDealCount === 1 ? "has" : "have"} no expected close date or {" "}
          a date more than 180 days in the past — review before relying on the headline figure.
        </div>
      ) : null}

      {/* ── Summary Strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <SummaryCard
          label="Total Weighted GCI"
          value={fmtCurrency(result.totalWeightedGCI)}
          icon={<TrendingUp className="h-4 w-4 text-cyan-500" />}
          primary
        />
        <SummaryCard
          label="Pipeline Deals"
          value={String(result.dealCount)}
          subValue={fmtCurrency(result.dealWeightedGCI)}
          icon={<Layers className="h-4 w-4 text-cyan-500" />}
        />
        <SummaryCard
          label="Active Listings"
          value={String(result.listingCount)}
          subValue={fmtCurrency(result.listingWeightedGCI)}
          icon={<Home className="h-4 w-4 text-amber-500" />}
        />
        <SummaryCard
          label="Tracked Buyers"
          value={String(result.buyerCount)}
          subValue={fmtCurrency(result.buyerWeightedGCI)}
          icon={<User className="h-4 w-4 text-teal-500" />}
        />
        {result.accuracy.overallScore != null ? (
          <SummaryCard
            label="Forecast Accuracy"
            value={`${result.accuracy.overallScore}%`}
            subValue={`${result.accuracy.sampleSize} closed`}
            icon={<Target className="h-4 w-4 text-violet-500" />}
            valueClassName={accuracyColor(result.accuracy.overallScore)}
          />
        ) : (
          <SummaryCard
            label="Forecast Accuracy"
            value="—"
            subValue="Not enough data"
            icon={<Target className="h-4 w-4 text-slate-500" />}
          />
        )}
      </div>

      {/* ── Pipeline Table ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card">
        {sortedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Layers className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground max-w-md">
              No active pipeline items. Add deals in Transactions, listing
              appointments in CRM, or track buyers to see them here.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10">Source</TableHead>
                <TableHead>Name / Address</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Est. Value</TableHead>
                <TableHead className="text-right">Weighted GCI</TableHead>
                <TableHead className="text-right">Prob.</TableHead>
                <TableHead className="text-right">Expected Close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item) => (
                <PipelineRow
                  key={item.id}
                  item={item}
                  onEditListing={item.source === "listing" ? () => openEditListing(item) : undefined}
                  onDeleteListing={item.source === "listing" ? () => handleDeleteListing(item.id) : undefined}
                  deleting={deletingId === item.id}
                  onBuyerStatusChange={
                    item.source === "buyer"
                      ? (s) => handleBuyerStatusChange(item.id, s)
                      : undefined
                  }
                  savingStatus={savingStatusId === item.id}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Pipeline Intelligence ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AccuracyCard accuracy={result.accuracy} />
        <FunnelCard funnel={result.funnel.dealFunnel} />
      </div>

      {/* ── Listing Appointment Dialog ─────────────────────────────── */}
      <Dialog open={listingDialogOpen} onOpenChange={setListingDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingListing ? "Edit Listing Appointment" : "Add Listing Appointment"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Address */}
            <div className="grid gap-1.5">
              <Label>Property Address *</Label>
              <Input
                placeholder="123 Main St, Toronto"
                value={listingForm.property_address}
                onChange={(e) => setLF("property_address", e.target.value)}
              />
            </div>

            {/* Row: Est. Price + Commission % */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Estimated List Price ($) *</Label>
                <Input
                  type="number"
                  placeholder="750000"
                  value={listingForm.estimated_list_price}
                  onChange={(e) => setLF("estimated_list_price", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Commission %</Label>
                <Input
                  type="number"
                  step="0.25"
                  placeholder="2.5"
                  value={listingForm.estimated_commission_pct}
                  onChange={(e) => setLF("estimated_commission_pct", e.target.value)}
                />
              </div>
            </div>

            {/* Row: Appointment Date + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Appointment Date</Label>
                <Input
                  type="date"
                  value={listingForm.appointment_date}
                  onChange={(e) => setLF("appointment_date", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={listingForm.status} onValueChange={(v) => setLF("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="withdrawn">Withdrawn</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row: Actual List Price + Actual Sale Price (show when relevant) */}
            {(listingForm.status === "active" || listingForm.status === "sold" || listingForm.status === "expired" || listingForm.status === "withdrawn") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Actual List Price ($)</Label>
                  <Input
                    type="number"
                    placeholder="Listed at..."
                    value={listingForm.actual_list_price}
                    onChange={(e) => setLF("actual_list_price", e.target.value)}
                  />
                </div>
                {listingForm.status === "sold" && (
                  <div className="grid gap-1.5">
                    <Label>Sale Price ($)</Label>
                    <Input
                      type="number"
                      placeholder="Sold for..."
                      value={listingForm.actual_sale_price}
                      onChange={(e) => setLF("actual_sale_price", e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Row: Expected Close + Listing Agreement Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Expected Close Date</Label>
                <Input
                  type="date"
                  value={listingForm.expected_close_date}
                  onChange={(e) => setLF("expected_close_date", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Listing Agreement Date</Label>
                <Input
                  type="date"
                  value={listingForm.listing_agreement_date}
                  onChange={(e) => setLF("listing_agreement_date", e.target.value)}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes about this listing..."
                rows={2}
                value={listingForm.notes}
                onChange={(e) => setLF("notes", e.target.value)}
              />
            </div>

            {/* GCI Preview */}
            {listingForm.estimated_list_price && (
              <p className="text-sm text-muted-foreground">
                Est. GCI:{" "}
                <span className="font-medium text-foreground">
                  {fmtCurrency(
                    Number(listingForm.estimated_list_price) *
                    (Number(listingForm.estimated_commission_pct) / 100),
                  )}
                </span>
              </p>
            )}

            <Button onClick={handleSaveListing} disabled={listingSaving}>
              {listingSaving
                ? "Saving…"
                : editingListing
                ? "Save Changes"
                : "Add Listing Appointment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  subValue,
  icon,
  primary,
  valueClassName,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  primary?: boolean;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-4 py-3 shadow-sm",
        primary && "lg:col-span-1",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-lg font-bold tracking-tight text-foreground",
          primary && "text-xl",
          valueClassName,
        )}
      >
        {value}
      </p>
      {subValue && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subValue}</p>
      )}
    </div>
  );
}

function PipelineRow({
  item,
  onEditListing,
  onDeleteListing,
  deleting,
  onBuyerStatusChange,
  savingStatus,
}: {
  item: UnifiedPipelineItem;
  onEditListing?: () => void;
  onDeleteListing?: () => void;
  deleting?: boolean;
  onBuyerStatusChange?: (newStatus: ClientStatus) => void;
  savingStatus?: boolean;
}) {
  const stageColor =
    STAGE_BADGE_COLORS[item.unifiedStage] ?? STAGE_BADGE_COLORS.pre_qualifying;
  const stageLabel =
    STAGE_LABELS[item.unifiedStage] ?? item.stage;

  // For buyer rows, the stage cell is an inline status dropdown bound directly
  // to the client's CRM status. item.stage is the raw client status
  // ("boarding" | "in_flight") set by the forecast engine.
  const buyerClientStatus = (item.stage as ClientStatus);

  return (
    <TableRow className={cn("border-border", onEditListing && "cursor-pointer hover:bg-muted/50")} onClick={onEditListing}>
      <TableCell>
        <div className="flex items-center gap-1.5" title={sourceLabel(item.source)}>
          {sourceIcon(item.source)}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{item.name}</span>
            {item.source === "buyer" && !item.estimatedValue && (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-600">
                No budget
              </span>
            )}
          </div>
          {item.clientName && item.source !== "buyer" && (
            <span className="text-xs text-muted-foreground">
              {item.clientName}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {onBuyerStatusChange ? (
          <Select
            value={buyerClientStatus}
            onValueChange={(v) => onBuyerStatusChange(v as ClientStatus)}
            disabled={savingStatus}
          >
            <SelectTrigger
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "h-6 w-auto gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                CLIENT_STATUS_COLORS[buyerClientStatus]?.bg,
                CLIENT_STATUS_COLORS[buyerClientStatus]?.text,
                CLIENT_STATUS_COLORS[buyerClientStatus]?.border,
                savingStatus && "opacity-60",
              )}
              aria-label="Change client status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent onClick={(e) => e.stopPropagation()}>
              {(Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        CLIENT_STATUS_COLORS[s].dot,
                      )}
                    />
                    {CLIENT_STATUS_LABELS[s]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
              stageColor,
            )}
          >
            {stageLabel}
          </span>
        )}
      </TableCell>
      <TableCell>{sideBadge(item.side)}</TableCell>
      <TableCell className="text-right font-medium text-foreground tabular-nums">
        {fmtCurrency(item.estimatedValue)}
      </TableCell>
      <TableCell className="text-right font-semibold text-foreground tabular-nums">
        {fmtCurrency(item.weightedGCI)}
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          {fmtPct(item.probability)}
          {item.manualOverride ? (
            <span
              title="Probability is manually overridden on this deal — bypasses stage default."
              aria-label="Manual probability override"
              className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 dark:bg-amber-950/40 dark:text-amber-300"
            >
              MANUAL
            </span>
          ) : null}
        </span>
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        <div className="flex items-center justify-end gap-2">
          <span>{formatDate(item.expectedCloseDate)}</span>
          {onDeleteListing && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteListing(); }}
              disabled={deleting}
              className="text-muted-foreground/50 hover:text-red-500 transition-colors p-0.5"
              title="Remove listing"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function AccuracyCard({
  accuracy,
}: {
  accuracy: ReturnType<typeof computePipelineForecast>["accuracy"];
}) {
  if (accuracy.overallScore == null) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-5 w-5 text-violet-500" />
          <h3 className="text-sm font-semibold text-foreground">
            Forecast Accuracy
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Not enough data yet — accuracy will appear after deals close.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-violet-500" />
        <h3 className="text-sm font-semibold text-foreground">
          Forecast Accuracy
        </h3>
      </div>

      <div className="flex items-baseline gap-3 mb-4">
        <span
          className={cn(
            "text-4xl font-bold tracking-tight",
            accuracyColor(accuracy.overallScore),
          )}
        >
          {accuracy.overallScore}%
        </span>
        <span className="text-sm text-muted-foreground">
          Based on {accuracy.sampleSize} closed deal
          {accuracy.sampleSize !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        {accuracy.listingAccuracy && (
          <p className="text-muted-foreground">
            Listing estimates: avg{" "}
            <span className="font-medium text-foreground">
              {fmtPct(accuracy.listingAccuracy.avgErrorPct)}
            </span>{" "}
            off
          </p>
        )}
        {accuracy.dealAccuracy && (
          <p className="text-muted-foreground">
            Deal estimates: avg{" "}
            <span className="font-medium text-foreground">
              {fmtPct(accuracy.dealAccuracy.avgErrorPct)}
            </span>{" "}
            off
          </p>
        )}
      </div>
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: FunnelStep[] }) {
  const hasData = funnel.some((s) => s.count > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-cyan-500" />
        <h3 className="text-sm font-semibold text-foreground">
          Conversion Funnel
        </h3>
      </div>

      {!hasData ? (
        <p className="text-sm text-muted-foreground">
          Conversion data will appear as deals move through stages.
        </p>
      ) : (
        <div className="flex items-center gap-1 flex-wrap">
          {funnel
            .filter((step) => step.stage !== "closed")
            .map((step, i, arr) => (
              <div key={step.stage} className="flex items-center gap-1">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium text-muted-foreground capitalize">
                    {step.stage}
                  </span>
                  <span className="text-lg font-bold text-foreground tabular-nums">
                    {step.count}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div className="flex flex-col items-center mx-1.5">
                    <span className="text-[10px] text-muted-foreground tabular-nums mb-0.5">
                      {step.conversionRate != null && i > 0
                        ? ""
                        : ""}
                      {arr[i + 1].conversionRate != null
                        ? fmtPct(arr[i + 1].conversionRate!)
                        : ""}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
