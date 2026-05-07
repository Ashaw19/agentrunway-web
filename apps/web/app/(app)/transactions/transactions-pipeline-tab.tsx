"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { validateTransaction, validatePipelineDeal, FIELD_LIMITS } from "@agent-runway/core/validation/input-guards";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Layers, DollarSign, TrendingUp, Info, CheckCircle2 } from "lucide-react";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function MetricInfo({ tip }: { tip: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help transition-colors shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-center leading-snug">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

import {
  computeEstimatedGCI,
  computeWeightedGCI,
  computeProbability,
  PIPELINE_STAGE_DEFAULTS,
  type PipelineDeal,
  type UserSettings,
} from "@/lib/types/database";
import { cn } from "@/lib/utils";
/** Local-timezone date string (avoids UTC date-shift at night) */
function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
import { useConfetti } from "@/hooks/use-confetti";
import { marginalRate } from "@/lib/engines/canadian-tax-engine";
import { DealCloseCelebration, type CelebrationData } from "./deal-close-celebration";

interface Props {
  pipelineDeals: PipelineDeal[];
  settings?: UserSettings | null;
  /** Closed transactions this year — used for YTD GCI + streak calculations */
  closedTransactions?: { sale_price: number; commission_pct: number; date: string }[];
}

type FormState = {
  address: string;
  client_name: string;
  client_id: string | null;
  estimated_price: string;
  estimated_commission_pct: string;
  side: "buyer" | "seller" | "both";
  stage: "lead" | "showing" | "offer" | "conditional" | "firm" | "closed";
  expected_close_date: string;
  probability_override: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  address: "",
  client_name: "",
  client_id: null,
  estimated_price: "",
  estimated_commission_pct: "2.5",
  side: "buyer",
  stage: "lead",
  expected_close_date: "",
  probability_override: "",
  notes: "",
});

type ClientOption = { id: string; name: string };

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  showing: "Showing",
  offer: "Offer",
  conditional: "Conditional",
  firm: "Firm",
  closed: "Closed",
};

const STAGE_CHIP: Record<string, string> = {
  lead:        "bg-slate-100 text-slate-700 border border-slate-200",
  showing:     "bg-blue-100 text-blue-800 border border-blue-200",
  offer:       "bg-amber-100 text-amber-800 border border-amber-200",
  conditional: "bg-purple-100 text-purple-800 border border-purple-200",
  firm:        "bg-emerald-100 text-emerald-800 border border-emerald-200",
  closed:      "bg-green-600 text-white border border-green-700",
};

const SIDE_CHIP: Record<string, string> = {
  buyer:  "bg-blue-100 text-blue-800 border border-blue-200",
  seller: "bg-purple-100 text-purple-800 border border-purple-200",
  both:   "bg-teal-100 text-teal-800 border border-teal-200",
};

type CloseForm = {
  client_name: string;
  sale_price: string;
  commission_pct: string;
  side: "buyer" | "seller" | "both";
  date: string;
};

export function TransactionsPipelineTab({ pipelineDeals, settings, closedTransactions = [] }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [deals, setDeals] = useState(pipelineDeals);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const deletingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const [closeTarget, setCloseTarget] = useState<PipelineDeal | null>(null);

  // Client search for linking deals to CRM contacts
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Server-side client search — debounced to avoid hammering DB on every keystroke
  useEffect(() => {
    if (!dialogOpen || clientSearch.length < 1) {
      setClientOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      supabase
        .from("clients")
        .select("id, first_name, last_name")
        .ilike("name_search", `%${clientSearch.toLowerCase()}%`)
        .order("last_name")
        .limit(20)
        .then(({ data }) => {
          if (data) {
            setClientOptions(
              data.map((c) => ({
                id: c.id,
                name: [c.first_name, c.last_name].filter(Boolean).join(" "),
              })),
            );
          }
        });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, clientSearch]);
  const [closeForm, setCloseForm] = useState<CloseForm>({
    client_name: "",
    sale_price: "",
    commission_pct: "",
    side: "buyer",
    date: localDateStr(),
  });
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const { fire: fireConfetti } = useConfetti();

  useEffect(() => {
    if (closeTarget) {
      setCloseForm({
        client_name: closeTarget.client_name ?? "",
        sale_price: closeTarget.estimated_price?.toString() ?? "",
        commission_pct: closeTarget.estimated_commission_pct != null
          ? String(closeTarget.estimated_commission_pct * 100)
          : "",
        side: closeTarget.side ?? "buyer",
        date: localDateStr(),
      });
    }
  }, [closeTarget]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setClientSearch("");
    setDialogOpen(true);
  }

  function openEdit(deal: PipelineDeal) {
    setEditingId(deal.id);
    setForm({
      address: deal.address ?? "",
      client_name: deal.client_name ?? "",
      client_id: deal.client_id ?? null,
      estimated_price: deal.estimated_price ? String(deal.estimated_price) : "",
      estimated_commission_pct: deal.estimated_commission_pct
        ? String(deal.estimated_commission_pct * 100)
        : "2.5",
      side: deal.side,
      stage: deal.stage,
      expected_close_date: deal.expected_close_date ?? "",
      probability_override:
        deal.probability_override != null
          ? String(Math.round(deal.probability_override * 100))
          : "",
      notes: deal.notes ?? "",
    });
    setClientSearch(deal.client_name ?? "");
    setDialogOpen(true);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { savingRef.current = false; setSaving(false); return; }

    // ── Validate all numeric fields before writing ──────────────────────────
    const validation = validatePipelineDeal({
      estimated_price: form.estimated_price,
      estimated_commission_pct: form.estimated_commission_pct,
      probability_override: form.probability_override || undefined,
      address: form.address,
      notes: form.notes,
    });
    if (!validation.valid || !validation.parsed) {
      validation.errors.forEach((msg) => toast.error(msg));
      savingRef.current = false;
      setSaving(false);
      return;
    }
    const { parsed } = validation;

    const payload = {
      address: form.address.slice(0, FIELD_LIMITS.address),
      client_name: form.client_name.slice(0, FIELD_LIMITS.clientName),
      client_id: form.client_id || null,
      estimated_price: parsed.estimated_price,
      estimated_commission_pct: parsed.estimated_commission_pct,
      side: form.side,
      stage: form.stage,
      expected_close_date: form.expected_close_date || null,
      probability_override: parsed.probability_override,
      notes: form.notes.slice(0, FIELD_LIMITS.notes),
    };

    let failed = false;

    if (editingId) {
      const { data, error } = await supabase
        .from("pipeline_deals")
        .update(payload)
        .eq("id", editingId)
        .eq("user_id", user.id)
        .select()
        .single();
      if (!error && data) {
        setDeals((prev) => prev.map((d) => (d.id === editingId ? data : d)));
        if (form.stage === "closed") {
          // Auto-open the Close Deal dialog so the deal converts immediately
          savingRef.current = false;
          setSaving(false);
          setDialogOpen(false);
          setCloseTarget(data);
          return;
        }
        toast.success("Deal updated ✓");
      } else if (error) {
        failed = true;
        const detail = error.code === "23514" ? "Value out of allowed range" : "Something went wrong. Please try again.";
        toast.error(`Couldn't update deal: ${detail}`);
      }
    } else {
      const { data, error } = await supabase
        .from("pipeline_deals")
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (!error && data) {
        setDeals((prev) => [data, ...prev]);
        toast.success("In the pipeline. Let's see it through. 🎯");
      } else if (error) {
        failed = true;
        const detail = error.code === "23514" ? "Value out of allowed range" : "Something went wrong. Please try again.";
        toast.error(`Couldn't save deal: ${detail}`);
      }
    }

    savingRef.current = false;
    setSaving(false);
    if (!failed) setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    if (deletingRef.current) return;
    deletingRef.current = true;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { deletingRef.current = false; return; }
    const { error } = await supabase.from("pipeline_deals").delete().eq("id", id).eq("user_id", user.id);
    if (!error) {
      setDeals((prev) => prev.filter((d) => d.id !== id));
      toast("Removed. On to the next one.");
    } else {
      toast.error("Couldn't delete — try again");
    }
    setDeleteConfirmId(null);
    deletingRef.current = false;
  }

  async function handleClose() {
    if (!closeTarget || closing) return;
    setClosing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setClosing(false); return; }

    // ── Validate close-deal form ─────────────────────────────────────────────
    const closeValidation = validateTransaction({
      sale_price: closeForm.sale_price,
      commission_pct: closeForm.commission_pct,
    });
    if (!closeValidation.valid || !closeValidation.parsed) {
      closeValidation.errors.forEach((msg) => toast.error(msg));
      setClosing(false);
      return;
    }
    const salePrice = closeValidation.parsed.sale_price;
    const commPct   = closeValidation.parsed.commission_pct;
    const gci       = salePrice * commPct;

    // Preserve original estimate for accuracy tracking — single write below avoids TOCTOU.
    const preservedOriginalEstimate =
      closeTarget.original_estimated_price ?? closeTarget.estimated_price;

    const { data: txData, error: txErr } = await supabase.from("transactions").insert({
      user_id: user.id,
      address: closeTarget.address,
      client_name: closeForm.client_name || "",
      sale_price: salePrice,
      commission_pct: commPct,
      side: closeForm.side,
      status: "closed",
      date: closeForm.date,
      source: "manual",
      pipeline_deal_id: closeTarget.id,
    }).select("id").single();
    if (txErr || !txData) {
      const detail = txErr?.code === "23514" ? "Value out of allowed range" : "Failed to create transaction";
      toast.error(`Couldn't close deal: ${detail}`);
      setClosing(false);
      return;
    }

    const { error: closeErr } = await supabase
      .from("pipeline_deals")
      .update({
        stage: "closed",
        original_estimated_price: preservedOriginalEstimate,
      })
      .eq("id", closeTarget.id)
      .eq("user_id", user.id);

    if (closeErr) {
      // Rollback: delete the transaction we just created to avoid inconsistent state
      await supabase.from("transactions").delete().eq("id", txData.id).eq("user_id", user.id);
      toast.error("Failed to close deal — changes rolled back");
      setClosing(false);
      return;
    }

    setDeals((prev) => prev.filter((d) => d.id !== closeTarget.id));

    // ── Compute celebration data ──────────────────────────────────────────
    const province = settings?.province ?? "ontario";
    const goalGCI  = settings?.goal_gci ?? 0;
    const _now = new Date();
    const thisYear = _now.getFullYear().toString();
    const thisMonth = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`;

    // YTD GCI from passed-in closed transactions (before this deal)
    const ytdGCIBefore = closedTransactions
      .filter((t) => t.date?.startsWith(thisYear))
      .reduce((sum, t) => sum + t.sale_price * t.commission_pct, 0);

    // Deals this month (from passed-in list + 1 for this deal)
    const dealsThisMonthBefore = closedTransactions.filter(
      (t) => t.date?.startsWith(thisMonth)
    ).length;
    const dealsThisMonth = dealsThisMonthBefore + 1;

    // Total deals this year
    const totalDealsThisYear = closedTransactions.filter(
      (t) => t.date?.startsWith(thisYear)
    ).length + 1;

    // Estimated marginal rate at projected annual income
    const projectedAnnual = ytdGCIBefore + gci;
    const estMarginalRate = marginalRate(projectedAnnual > 0 ? projectedAnnual : goalGCI, province);

    setCelebration({
      address: closeTarget.address ?? "",
      clientName: closeForm.client_name ?? "",
      gci,
      ytdGCIBefore,
      goalGCI,
      province,
      dealsThisMonth,
      totalDealsThisYear,
      estimatedMarginalRate: estMarginalRate,
      // D-4 fix (Audit 1 2026-04-22): forward HST registration + brokerage-
      // withholds flag so the per-deal celebration row zeros out for
      // unregistered agents and brokerage-remits flows.
      isGstHstRegistered: settings?.gst_hst_registered ?? false,
      brokerageWithholdsHst: settings?.brokerage_withholds_hst ?? false,
    });

    setCloseTarget(null);

    // Fire confetti after a short delay so the modal is visible first
    setTimeout(() => fireConfetti("goal"), 150);

    setClosing(false);
  }

  const totalWeighted = deals.reduce((sum, d) => sum + computeWeightedGCI(d), 0);
  const avgDealValue = deals.length > 0
    ? deals.reduce((sum, d) => sum + computeEstimatedGCI(d), 0) / deals.length
    : 0;

  // Preview GCI in form
  const previewEstGCI =
    (parseFloat(form.estimated_price) || 0) *
    ((parseFloat(form.estimated_commission_pct) || 0) / 100);
  const previewProb = form.probability_override
    ? parseFloat(form.probability_override) / 100
    : PIPELINE_STAGE_DEFAULTS[form.stage] ?? 0;
  const previewWeighted = previewEstGCI * previewProb;

  return (
    <div className="space-y-6">
      {/* Pipeline sub-header + Add button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {deals.length > 0
            ? <>{deals.length} active deal{deals.length !== 1 ? "s" : ""} &middot; {fmtCurrency(totalWeighted)} weighted GCI</>
            : "Track deals before they close. Probability is just math with ambition."}
        </p>
        <Button onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" />
          Add Deal
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-100 to-blue-50 px-5 py-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-200">
            <Layers className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Active Deals</p>
            <p className="text-2xl font-bold text-slate-800">{deals.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-100 to-purple-50 px-5 py-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-200">
            <TrendingUp className="h-5 w-5 text-purple-700" />
          </div>
          <div>
            <span className="flex items-center gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Weighted GCI</p>
              <MetricInfo tip="Your pipeline total adjusted for each deal's probability of closing — a more realistic picture than face value." />
            </span>
            <p className="text-2xl font-bold text-slate-800">{fmtCurrency(totalWeighted)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-100 to-teal-50 px-5 py-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-200">
            <DollarSign className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Avg Deal Value</p>
            <p className="text-2xl font-bold text-slate-800">{deals.length > 0 ? fmtCurrency(avgDealValue) : "—"}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {deals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Layers className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground max-w-md">
                Empty pipeline. Even Gretzky skated to where the puck was going.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address / Client</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Est. GCI</TableHead>
                  <TableHead className="text-right">Weighted</TableHead>
                  <TableHead>Close Date</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => (
                  <TableRow key={deal.id}>
                    <TableCell>
                      <p className="text-sm font-medium">
                        {deal.address || <span className="text-muted-foreground">No address</span>}
                      </p>
                      {deal.client_name && (
                        <p className="text-xs text-muted-foreground">{deal.client_name}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", SIDE_CHIP[deal.side] ?? "bg-slate-100 text-slate-700 border border-slate-200")}>
                        {deal.side}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STAGE_CHIP[deal.stage] ?? "bg-slate-100 text-slate-700 border border-slate-200")}>
                        {STAGE_LABELS[deal.stage]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {fmtCurrency(computeEstimatedGCI(deal))}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {fmtCurrency(computeWeightedGCI(deal))}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({fmtPct(computeProbability(deal))})
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {deal.expected_close_date
                        ? deal.expected_close_date
                        : <span className="text-muted-foreground">&mdash;</span>}
                    </TableCell>
                    <TableCell>
                      {deleteConfirmId === deal.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 px-3 text-xs"
                            onClick={() => handleDelete(deal.id)}
                          >
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-3 text-xs"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            title="Mark as Closed"
                            onClick={() => setCloseTarget(deal)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEdit(deal)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteConfirmId(deal.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Deal" : "Add Pipeline Deal"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Address */}
            <div className="grid gap-1.5">
              <Label>Address</Label>
              <Input
                placeholder="123 Main St, Toronto"
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
              />
            </div>

            {/* Row: Client + Side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative grid gap-1.5">
                <Label>Client {form.client_id && <span className="text-emerald-600 text-xs font-normal">· linked</span>}</Label>
                <Input
                  placeholder="Search or type name…"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setField("client_name", e.target.value);
                    // Clear link if user edits the name manually
                    if (form.client_id) setField("client_id", null);
                    setShowClientDropdown(true);
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  onBlur={() => {
                    // Delay to allow click on dropdown item
                    setTimeout(() => setShowClientDropdown(false), 200);
                  }}
                />
                {showClientDropdown && clientSearch.length >= 1 && (() => {
                  if (clientOptions.length === 0) {
                    return (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-slate-200 bg-white shadow-lg px-3 py-2.5 text-xs text-muted-foreground">
                        No clients found — type a name to add a new one
                      </div>
                    );
                  }
                  return (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                      {clientOptions.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setField("client_name", c.name);
                            setField("client_id", c.id);
                            setClientSearch(c.name);
                            setShowClientDropdown(false);
                          }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="grid gap-1.5">
                <Label>Side *</Label>
                <Select value={form.side} onValueChange={(v) => setField("side", v as FormState["side"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row: Est. Price + Commission % */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Estimated Price ($) *</Label>
                <Input
                  type="number"
                  placeholder="750000"
                  value={form.estimated_price}
                  onChange={(e) => setField("estimated_price", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Commission % *</Label>
                <Input
                  type="number"
                  step="0.25"
                  placeholder="2.5"
                  value={form.estimated_commission_pct}
                  onChange={(e) => setField("estimated_commission_pct", e.target.value)}
                />
              </div>
            </div>

            {/* Row: Stage + Close Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Stage *</Label>
                <Select value={form.stage} onValueChange={(v) => setField("stage", v as FormState["stage"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead (10%)</SelectItem>
                    <SelectItem value="showing">Showing (25%)</SelectItem>
                    <SelectItem value="offer">Offer (50%)</SelectItem>
                    <SelectItem value="conditional">Conditional (75%)</SelectItem>
                    <SelectItem value="firm">Firm (90%)</SelectItem>
                    <SelectItem value="closed">Closed (100%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Expected Close</Label>
                <Input
                  type="date"
                  value={form.expected_close_date}
                  onChange={(e) => setField("expected_close_date", e.target.value)}
                />
              </div>
            </div>

            {/* Probability Override */}
            <div className="grid gap-1.5">
              <Label>
                Probability Override (%){" "}
                <span className="text-xs text-muted-foreground">
                  — leave blank to use stage default ({Math.round((PIPELINE_STAGE_DEFAULTS[form.stage] ?? 0) * 100)}%)
                </span>
              </Label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder={String(Math.round((PIPELINE_STAGE_DEFAULTS[form.stage] ?? 0) * 100))}
                value={form.probability_override}
                onChange={(e) => setField("probability_override", e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes..."
                rows={2}
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
              />
            </div>

            {/* Preview */}
            <p className="text-sm text-muted-foreground">
              Est. GCI:{" "}
              <span className="font-medium text-foreground">{fmtCurrency(previewEstGCI)}</span>
              {" "}→ Weighted:{" "}
              <span className="font-medium text-foreground">{fmtCurrency(previewWeighted)}</span>
              {" "}({fmtPct(previewProb)})
            </p>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Deal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deal Close Celebration */}
      {celebration && (
        <DealCloseCelebration
          open={!!celebration}
          onClose={() => setCelebration(null)}
          data={celebration}
        />
      )}

      {/* Close Deal Dialog */}
      <Dialog open={!!closeTarget} onOpenChange={(o) => !o && setCloseTarget(null)}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Close Deal — {closeTarget?.address}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Address (read-only) */}
            <div className="grid gap-1.5">
              <Label>Address</Label>
              <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                {closeTarget?.address || <span className="italic">No address</span>}
              </p>
            </div>

            {/* Client Name */}
            <div className="grid gap-1.5">
              <Label>Client Name</Label>
              <Input
                placeholder="Jane Smith"
                value={closeForm.client_name}
                onChange={(e) => setCloseForm((prev) => ({ ...prev, client_name: e.target.value }))}
              />
            </div>

            {/* Row: Sale Price + Commission % */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Sale Price ($)</Label>
                <Input
                  type="number"
                  placeholder="750000"
                  value={closeForm.sale_price}
                  onChange={(e) => setCloseForm((prev) => ({ ...prev, sale_price: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Commission %</Label>
                <Input
                  type="number"
                  step="0.25"
                  placeholder="2.5"
                  value={closeForm.commission_pct}
                  onChange={(e) => setCloseForm((prev) => ({ ...prev, commission_pct: e.target.value }))}
                />
              </div>
            </div>

            {/* Row: Side + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Side</Label>
                <Select
                  value={closeForm.side}
                  onValueChange={(v) => setCloseForm((prev) => ({ ...prev, side: v as CloseForm["side"] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Close Date</Label>
                <Input
                  type="date"
                  value={closeForm.date}
                  onChange={(e) => setCloseForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>
            </div>

            {/* GCI Preview */}
            <p className="text-sm text-muted-foreground">
              GCI:{" "}
              <span className="font-medium text-foreground">
                {fmtCurrency(
                  (parseFloat(closeForm.sale_price) || 0) *
                  ((parseFloat(closeForm.commission_pct) || 0) / 100)
                )}
              </span>
            </p>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCloseTarget(null)}>
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleClose}
                disabled={closing}
              >
                {closing ? "Closing…" : "Close Deal ✓"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
