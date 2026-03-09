"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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
import { Plus, Pencil, Trash2, DollarSign, Briefcase, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCurrency } from "@/lib/formatters";
import { computeGCI, type Transaction } from "@/lib/types/database";

interface Props {
  initialTransactions: Transaction[];
}

type FormState = {
  date: string;
  address: string;
  client_name: string;
  side: "buyer" | "seller" | "both";
  status: "closed" | "pending" | "fallen";
  sale_price: string;
  commission_pct: string;
  gci_override: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  date: new Date().toISOString().split("T")[0],
  address: "",
  client_name: "",
  side: "buyer",
  status: "closed",
  sale_price: "",
  commission_pct: "2.5",
  gci_override: "",
  notes: "",
});

const STATUS_CHIP: Record<string, string> = {
  closed:  "bg-emerald-100 text-emerald-800 border border-emerald-200",
  pending: "bg-amber-100 text-amber-800 border border-amber-200",
  fallen:  "bg-red-100 text-red-800 border border-red-200",
};

const SIDE_CHIP: Record<string, string> = {
  buyer:  "bg-blue-100 text-blue-800 border border-blue-200",
  seller: "bg-purple-100 text-purple-800 border border-purple-200",
  both:   "bg-teal-100 text-teal-800 border border-teal-200",
};

export function TransactionsContent({ initialTransactions }: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "closed" | "pending" | "fallen">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(tx: Transaction) {
    setEditingId(tx.id);
    setForm({
      date: tx.date,
      address: tx.address ?? "",
      client_name: tx.client_name ?? "",
      side: tx.side,
      status: tx.status,
      sale_price: tx.sale_price ? String(tx.sale_price) : "",
      commission_pct: tx.commission_pct ? String(tx.commission_pct * 100) : "2.5",
      gci_override: tx.gci_override ? String(tx.gci_override) : "",
      notes: tx.notes ?? "",
    });
    setDialogOpen(true);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      date: form.date,
      address: form.address,
      client_name: form.client_name,
      side: form.side,
      status: form.status,
      sale_price: parseFloat(form.sale_price) || 0,
      commission_pct: (parseFloat(form.commission_pct) || 0) / 100,
      gci_override: form.gci_override ? parseFloat(form.gci_override) : null,
      notes: form.notes,
    };

    if (editingId) {
      const { data, error } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", editingId)
        .select()
        .single();
      if (!error && data) {
        setTransactions((prev) =>
          prev.map((t) => (t.id === editingId ? data : t))
            .sort((a, b) => b.date.localeCompare(a.date)),
        );
        toast.success("Deal updated ✓");
      } else if (error) {
        toast.error("Couldn't save — try again");
      }
    } else {
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (!error && data) {
        setTransactions((prev) =>
          [data, ...prev].sort((a, b) => b.date.localeCompare(a.date)),
        );
        toast.success("Deal logged 🎉", {
          description: form.address ? `${form.address} added to your record.` : undefined,
        });
      } else if (error) {
        toast.error("Couldn't save — try again");
      }
    }

    setSaving(false);
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (!error) {
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      toast("Deal removed", { description: "Your numbers have been updated." });
    } else {
      toast.error("Couldn't delete — try again");
    }
    setDeleteConfirmId(null);
  }

  // Compare year strings directly to avoid UTC-vs-local-timezone mismatch
  const currentYear = String(new Date().getFullYear());
  const ytdCount = transactions.filter(
    (t) => t.status === "closed" && t.date.startsWith(currentYear),
  ).length;
  const ytdGCI = transactions
    .filter((t) => t.status === "closed" && t.date.startsWith(currentYear))
    .reduce((sum, t) => sum + computeGCI(t), 0);

  // Filtered + sorted view
  const visibleTransactions = transactions
    .filter((t) => filter === "all" || t.status === filter)
    .sort((a, b) => {
      if (sortBy === "oldest") return a.date.localeCompare(b.date);
      if (sortBy === "highest") return computeGCI(b) - computeGCI(a);
      if (sortBy === "lowest") return computeGCI(a) - computeGCI(b);
      return b.date.localeCompare(a.date); // newest
    });

  const FILTERS: { value: typeof filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "closed", label: "Closed" },
    { value: "pending", label: "Pending" },
    { value: "fallen", label: "Fallen" },
  ];

  const avgDealSize = ytdCount > 0 ? ytdGCI / ytdCount : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {ytdCount > 0
              ? <>{ytdCount} closed deal{ytdCount !== 1 ? "s" : ""} this year &middot; {fmtCurrency(ytdGCI)} GCI</>
              : "Log your first deal to start tracking your GCI."}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" />
          Add Deal
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-50 px-5 py-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-200">
            <DollarSign className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">YTD GCI</p>
            <p className="text-2xl font-bold text-slate-800">{fmtCurrency(ytdGCI)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-100 to-blue-50 px-5 py-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-200">
            <Briefcase className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Closed Deals</p>
            <p className="text-2xl font-bold text-slate-800">{ytdCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-100 to-purple-50 px-5 py-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-200">
            <TrendingUp className="h-5 w-5 text-purple-700" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Avg Deal Size</p>
            <p className="text-2xl font-bold text-slate-800">{ytdCount > 0 ? fmtCurrency(avgDealSize) : "—"}</p>
          </div>
        </div>
      </div>

      {/* Filter + Sort bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filter pills */}
        <div className="flex rounded-lg border border-border p-0.5 text-xs">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Sort select */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort:</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="highest">Highest GCI</SelectItem>
              <SelectItem value="lowest">Lowest GCI</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nothing closed yet — log your first deal and your forecast comes to life. 🚀
            </div>
          ) : visibleTransactions.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No {filter} transactions.
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">GCI</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {tx.date}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.address || <span className="text-muted-foreground">&mdash;</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.client_name || <span className="text-muted-foreground">&mdash;</span>}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", SIDE_CHIP[tx.side] ?? "bg-slate-100 text-slate-700 border border-slate-200")}>
                        {tx.side}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", STATUS_CHIP[tx.status] ?? "bg-slate-100 text-slate-700 border border-slate-200")}>
                        {tx.status}
                      </span>
                    </TableCell>
                    <TableCell className={cn("text-right font-semibold", tx.status === "closed" ? "text-emerald-700" : tx.status === "pending" ? "text-amber-700" : "text-slate-400")}>
                      {fmtCurrency(computeGCI(tx))}
                    </TableCell>
                    <TableCell>
                      {deleteConfirmId === tx.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleDelete(tx.id)}
                          >
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEdit(tx)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteConfirmId(tx.id)}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Deal" : "Add Deal"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Row: Date + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField("date", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Status *</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v as FormState["status"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="fallen">Fallen Through</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Past/future year warning */}
            {form.date && new Date(form.date + "T12:00:00").getFullYear() !== new Date().getFullYear() && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This date is in <strong>{new Date(form.date + "T12:00:00").getFullYear()}</strong> — it will count toward that year&apos;s history, not your {new Date().getFullYear()} YTD.
                </span>
              </div>
            )}

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
              <div className="grid gap-1.5">
                <Label>Client Name</Label>
                <Input
                  placeholder="Jane Smith"
                  value={form.client_name}
                  onChange={(e) => setField("client_name", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Side *</Label>
                <Select value={form.side} onValueChange={(v) => setField("side", v as FormState["side"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row: Sale Price + Commission % */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Sale Price ($) *</Label>
                <Input
                  type="number"
                  placeholder="500000"
                  value={form.sale_price}
                  onChange={(e) => setField("sale_price", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Commission % *</Label>
                <Input
                  type="number"
                  step="0.25"
                  placeholder="2.5"
                  value={form.commission_pct}
                  onChange={(e) => setField("commission_pct", e.target.value)}
                />
              </div>
            </div>

            {/* GCI Override */}
            <div className="grid gap-1.5">
              <Label>
                GCI Override ($){" "}
                <span className="text-xs text-muted-foreground">
                  — leave blank to calculate from price × commission
                </span>
              </Label>
              <Input
                type="number"
                placeholder="e.g. 12500"
                value={form.gci_override}
                onChange={(e) => setField("gci_override", e.target.value)}
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

            {/* Preview GCI */}
            <p className="text-sm text-muted-foreground">
              GCI:{" "}
              <span className="font-medium text-foreground">
                {form.gci_override
                  ? fmtCurrency(parseFloat(form.gci_override) || 0)
                  : fmtCurrency(
                      (parseFloat(form.sale_price) || 0) *
                        ((parseFloat(form.commission_pct) || 0) / 100),
                    )}
              </span>
            </p>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Deal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
