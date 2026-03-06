"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
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

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive"> = {
  closed: "default",
  pending: "secondary",
  fallen: "destructive",
};

export function TransactionsContent({ initialTransactions }: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    }
    setDeleteConfirmId(null);
  }

  const ytdCount = transactions.filter(
    (t) => t.status === "closed" && new Date(t.date).getFullYear() === new Date().getFullYear(),
  ).length;
  const ytdGCI = transactions
    .filter((t) => t.status === "closed" && new Date(t.date).getFullYear() === new Date().getFullYear())
    .reduce((sum, t) => sum + computeGCI(t), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {ytdCount} closed deals this year &middot; {fmtCurrency(ytdGCI)} GCI
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" />
          Add Deal
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No transactions yet. Add your first deal to get started.
            </div>
          ) : (
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
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(tx.date).toLocaleDateString("en-CA")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.address || <span className="text-muted-foreground">&mdash;</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.client_name || <span className="text-muted-foreground">&mdash;</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs">
                        {tx.side}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[tx.status]} className="capitalize text-xs">
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
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
