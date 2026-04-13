"use client";

import { useState, useMemo, useRef } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Search,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  Lock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fmtCurrency } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

interface Referral {
  id: string;
  user_id: string;
  direction: "inbound" | "outbound";
  partner_name: string;
  partner_brokerage: string;
  partner_email: string;
  partner_phone: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  referral_date: string;
  status: "pending" | "active" | "closed" | "expired" | "cancelled";
  property_address: string;
  transaction_type: "buy" | "sell" | "both";
  referral_fee_pct: number;
  estimated_value: number;
  actual_fee_paid: number;
  fee_paid_date: string | null;
  transaction_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface Transaction {
  id: string;
  address: string;
  date: string;
  status: string;
}

interface Props {
  referrals: Referral[];
  transactions: Transaction[];
  isPro: boolean;
  userId: string;
}

type StatusFilter = "all" | Referral["status"];
type DirectionFilter = "all" | "inbound" | "outbound";

const STATUS_CONFIG: Record<
  Referral["status"],
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: {
    label: "Pending",
    color: "bg-amber-100 text-amber-700",
    icon: Clock,
  },
  active: {
    label: "Active",
    color: "bg-blue-100 text-blue-700",
    icon: Users,
  },
  closed: {
    label: "Closed",
    color: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle2,
  },
  expired: {
    label: "Expired",
    color: "bg-slate-100 text-slate-500",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-100 text-red-600",
    icon: XCircle,
  },
};

// ── Empty form state ─────────────────────────────────────────────────────────

interface ReferralForm {
  direction: "inbound" | "outbound";
  partner_name: string;
  partner_brokerage: string;
  partner_email: string;
  partner_phone: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  referral_date: string;
  status: Referral["status"];
  property_address: string;
  transaction_type: "buy" | "sell" | "both";
  referral_fee_pct: number;
  estimated_value: number;
  actual_fee_paid: number;
  fee_paid_date: string | null;
  transaction_id: string;
  notes: string;
}

const EMPTY_FORM: ReferralForm = {
  direction: "inbound",
  partner_name: "",
  partner_brokerage: "",
  partner_email: "",
  partner_phone: "",
  client_name: "",
  client_email: "",
  client_phone: "",
  referral_date: new Date().toISOString().slice(0, 10),
  status: "pending" as const,
  property_address: "",
  transaction_type: "buy" as const,
  referral_fee_pct: 25,
  estimated_value: 0,
  actual_fee_paid: 0,
  fee_paid_date: null,
  transaction_id: "",
  notes: "",
};

// ── Component ────────────────────────────────────────────────────────────────

export function ReferralsContent({
  referrals: initialReferrals,
  transactions,
  isPro,
  userId,
}: Props) {
  const [referrals, setReferrals] = useState(initialReferrals);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [directionFilter, setDirectionFilter] =
    useState<DirectionFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── KPI calculations ────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const inbound = referrals.filter((r) => r.direction === "inbound");
    const outbound = referrals.filter((r) => r.direction === "outbound");
    const closed = referrals.filter((r) => r.status === "closed");
    const totalFeesEarned = inbound
      .filter((r) => r.status === "closed")
      .reduce((sum, r) => sum + Number(r.actual_fee_paid), 0);
    const totalFeesPaid = outbound
      .filter((r) => r.status === "closed")
      .reduce((sum, r) => sum + Number(r.actual_fee_paid), 0);
    const pending = referrals.filter((r) => r.status === "pending").length;
    const active = referrals.filter((r) => r.status === "active").length;

    return {
      total: referrals.length,
      inbound: inbound.length,
      outbound: outbound.length,
      closed: closed.length,
      pending,
      active,
      totalFeesEarned,
      totalFeesPaid,
      netFees: totalFeesEarned - totalFeesPaid,
    };
  }, [referrals]);

  // ── Filtered list ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return referrals.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (directionFilter !== "all" && r.direction !== directionFilter)
        return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.partner_name.toLowerCase().includes(q) ||
          r.client_name.toLowerCase().includes(q) ||
          r.partner_brokerage.toLowerCase().includes(q) ||
          r.property_address.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [referrals, search, statusFilter, directionFilter]);

  // ── CRUD ────────────────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null);
    const d = new Date();
    const todayLocal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    setForm({ ...EMPTY_FORM, referral_date: todayLocal });
    setDialogOpen(true);
  }

  function openEdit(r: Referral) {
    setEditingId(r.id);
    setForm({
      direction: r.direction,
      partner_name: r.partner_name,
      partner_brokerage: r.partner_brokerage,
      partner_email: r.partner_email,
      partner_phone: r.partner_phone,
      client_name: r.client_name,
      client_email: r.client_email,
      client_phone: r.client_phone,
      referral_date: r.referral_date,
      status: r.status,
      property_address: r.property_address,
      transaction_type: r.transaction_type,
      referral_fee_pct: Number(r.referral_fee_pct),
      estimated_value: Number(r.estimated_value),
      actual_fee_paid: Number(r.actual_fee_paid),
      fee_paid_date: r.fee_paid_date ?? "",
      transaction_id: r.transaction_id ?? "",
      notes: r.notes,
    });
    setDialogOpen(true);
  }

  const savingRef = useRef(false);
  async function handleSave() {
    if (savingRef.current) return;
    if (!form.partner_name.trim() || !form.client_name.trim()) {
      toast.error("Partner name and client name are required.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const supabase = createClient();

      const payload = {
        user_id: userId,
        direction: form.direction,
        partner_name: form.partner_name.trim(),
        partner_brokerage: form.partner_brokerage.trim(),
        partner_email: form.partner_email.trim(),
        partner_phone: form.partner_phone.trim(),
        client_name: form.client_name.trim(),
        client_email: form.client_email.trim(),
        client_phone: form.client_phone.trim(),
        referral_date: form.referral_date,
        status: form.status,
        property_address: form.property_address.trim(),
        transaction_type: form.transaction_type,
        referral_fee_pct: form.referral_fee_pct,
        estimated_value: form.estimated_value,
        actual_fee_paid: form.actual_fee_paid,
        fee_paid_date: form.fee_paid_date || null,
        transaction_id: form.transaction_id || null,
        notes: form.notes.trim(),
      };

      if (editingId) {
        const { data, error } = await supabase
          .from("referrals")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", userId)
          .select()
          .maybeSingle();
        if (error || !data) {
          toast.error(error ? "Failed to update referral." : "Referral not found — it may have been deleted.");
          if (error) console.error(error);
        } else {
          setReferrals((prev) =>
            prev.map((r) => (r.id === editingId ? (data as Referral) : r))
          );
          toast.success("Referral updated.");
          setDialogOpen(false);
        }
      } else {
        const { data, error } = await supabase
          .from("referrals")
          .insert(payload)
          .select()
          .single();
        if (error) {
          toast.error("Failed to create referral.");
          console.error(error);
        } else {
          setReferrals((prev) => [data as Referral, ...prev]);
          toast.success("Referral created.");
          setDialogOpen(false);
        }
      }
    } catch (err) {
      console.error("handleSave unexpected error:", err);
      toast.error("Something went wrong — please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("referrals").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      toast.error("Failed to delete referral.");
    } else {
      setReferrals((prev) => prev.filter((r) => r.id !== id));
      toast.success("Referral deleted.");
    }
  }

  // ── Pro gate ────────────────────────────────────────────────────────────

  if (!isPro) {
    return (
      <div className="mx-auto max-w-2xl py-24 text-center">
        <Lock className="mx-auto mb-4 h-10 w-10 text-slate-300" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Referral Tracking
        </h1>
        <p className="text-slate-500 mb-6">
          Track inbound and outbound agent referrals, fees earned, and referral
          partner relationships. Available on the Professional plan.
        </p>
        <Button asChild>
          <Link href="/pricing">Upgrade to Professional</Link>
        </Button>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Referral Tracking</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track inbound and outbound referrals with fee tracking.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          New Referral
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3">
          <div className="rounded-lg bg-blue-100 p-1.5">
            <ArrowDownLeft className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Inbound</p>
            <p className="text-lg font-bold text-slate-800">{kpis.inbound}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
          <div className="rounded-lg bg-violet-100 p-1.5">
            <ArrowUpRight className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600">Outbound</p>
            <p className="text-lg font-bold text-slate-800">{kpis.outbound}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <div className="rounded-lg bg-emerald-100 p-1.5">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Fees Earned</p>
            <p className="text-lg font-bold text-slate-800">{fmtCurrency(kpis.totalFeesEarned)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <div className="rounded-lg bg-amber-100 p-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">Pending / Active</p>
            <p className="text-lg font-bold text-slate-800">{kpis.pending + kpis.active}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, brokerage, or property..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={directionFilter}
          onValueChange={(v) => setDirectionFilter(v as DirectionFilter)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Directions</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Referral List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 px-4 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground max-w-md">
            {referrals.length === 0
              ? "No referrals yet. Add your first one!"
              : "No referrals match your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const cfg = STATUS_CONFIG[r.status];
            const _StatusIcon = cfg.icon;
            const estimatedFee =
              Number(r.estimated_value) * (Number(r.referral_fee_pct) / 100);

            return (
              <Card
                key={r.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openEdit(r)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Direction icon */}
                      <div
                        className={cn(
                          "mt-0.5 rounded-lg p-2 shrink-0",
                          r.direction === "inbound"
                            ? "bg-blue-50"
                            : "bg-violet-50"
                        )}
                      >
                        {r.direction === "inbound" ? (
                          <ArrowDownLeft className="h-4 w-4 text-blue-600" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-violet-600" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">
                            {r.client_name}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn("text-[10px] shrink-0", cfg.color)}
                          >
                            {cfg.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {r.direction === "inbound"
                              ? "Inbound"
                              : "Outbound"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.direction === "inbound"
                            ? "Referred by"
                            : "Referred to"}{" "}
                          <span className="font-medium text-foreground">
                            {r.partner_name}
                          </span>
                          {r.partner_brokerage
                            ? ` · ${r.partner_brokerage}`
                            : ""}
                        </p>
                        {r.property_address && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.property_address}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right side — financials */}
                    <div className="text-right shrink-0">
                      {r.status === "closed" && Number(r.actual_fee_paid) > 0 ? (
                        <p className="text-sm font-bold text-emerald-600">
                          {fmtCurrency(Number(r.actual_fee_paid))}
                        </p>
                      ) : Number(r.estimated_value) > 0 ? (
                        <p className="text-sm font-medium text-slate-600">
                          ~{fmtCurrency(estimatedFee)}
                        </p>
                      ) : null}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {r.referral_fee_pct}% fee · {r.referral_date}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add/Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Referral" : "New Referral"}
            </DialogTitle>
            <DialogDescription>
              Track an agent referral and its associated fee.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Direction */}
            <div className="grid grid-cols-2 gap-2">
              {(["inbound", "outbound"] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => setForm({ ...form, direction: dir })}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all",
                    form.direction === dir
                      ? dir === "inbound"
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-violet-300 bg-violet-50 text-violet-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  )}
                >
                  {dir === "inbound" ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                  {dir === "inbound" ? "Inbound" : "Outbound"}
                </button>
              ))}
            </div>

            <Separator />

            {/* Partner info */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {form.direction === "inbound"
                  ? "Referring Agent"
                  : "Receiving Agent"}
              </Label>
              <div className="grid gap-3 mt-2">
                <Input
                  placeholder="Agent name *"
                  value={form.partner_name}
                  onChange={(e) =>
                    setForm({ ...form, partner_name: e.target.value })
                  }
                />
                <Input
                  placeholder="Brokerage"
                  value={form.partner_brokerage}
                  onChange={(e) =>
                    setForm({ ...form, partner_brokerage: e.target.value })
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Email"
                    type="email"
                    value={form.partner_email}
                    onChange={(e) =>
                      setForm({ ...form, partner_email: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Phone"
                    value={form.partner_phone}
                    onChange={(e) =>
                      setForm({ ...form, partner_phone: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Client info */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Client
              </Label>
              <div className="grid gap-3 mt-2">
                <Input
                  placeholder="Client name *"
                  value={form.client_name}
                  onChange={(e) =>
                    setForm({ ...form, client_name: e.target.value })
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Email"
                    type="email"
                    value={form.client_email}
                    onChange={(e) =>
                      setForm({ ...form, client_email: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Phone"
                    value={form.client_phone}
                    onChange={(e) =>
                      setForm({ ...form, client_phone: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Referral details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Referral Date</Label>
                <Input
                  type="date"
                  value={form.referral_date}
                  onChange={(e) =>
                    setForm({ ...form, referral_date: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      status: v as Referral["status"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Transaction Type</Label>
                <Select
                  value={form.transaction_type}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      transaction_type: v as "buy" | "sell" | "both",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buyer</SelectItem>
                    <SelectItem value="sell">Seller</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Referral Fee %</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.referral_fee_pct}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      referral_fee_pct: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <Input
              placeholder="Property address"
              value={form.property_address}
              onChange={(e) =>
                setForm({ ...form, property_address: e.target.value })
              }
            />

            <Separator />

            {/* Financial */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Estimated Transaction Value</Label>
                <Input
                  type="number"
                  step="1000"
                  value={form.estimated_value || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      estimated_value: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="$0"
                />
              </div>
              <div>
                <Label className="text-xs">Actual Fee Paid/Received</Label>
                <Input
                  type="number"
                  step="100"
                  value={form.actual_fee_paid || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      actual_fee_paid: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="$0"
                />
              </div>
            </div>

            {/* Link to transaction */}
            {transactions.length > 0 && (
              <div>
                <Label className="text-xs">Link to Transaction (optional)</Label>
                <Select
                  value={form.transaction_id || "none"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      transaction_id: v === "none" ? "" : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a transaction..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {transactions.map((tx) => (
                      <SelectItem key={tx.id} value={tx.id}>
                        {tx.address || "Untitled"} ({tx.date})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Notes */}
            <div>
              <Label className="text-xs">Notes</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                rows={3}
                placeholder="Any additional notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <div>
                {editingId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={async () => {
                      await handleDelete(editingId);
                      setDialogOpen(false);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editingId
                    ? "Update"
                    : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
