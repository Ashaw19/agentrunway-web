"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Lock, Unlock, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { fmtCurrency } from "@/lib/formatters";
import { computeGCI, type HistoryItem, type Transaction } from "@/lib/types/database";

interface Props {
  historyItems: HistoryItem[];
  transactions: Transaction[];
}

export function HistoryContent({ historyItems: initial, transactions }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addYear, setAddYear] = useState(new Date().getFullYear() - 1);
  const [addGCI, setAddGCI] = useState("");
  const [addTx, setAddTx] = useState("");

  // Group transactions by year for auto-derived stats
  const txByYear = transactions.reduce<Record<number, Transaction[]>>(
    (acc, tx) => {
      const y = new Date(tx.date).getFullYear();
      (acc[y] ??= []).push(tx);
      return acc;
    },
    {},
  );

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function toggleLock(item: HistoryItem) {
    const supabase = createClient();
    const { error } = await supabase
      .from("history_items")
      .update({ is_locked: !item.is_locked })
      .eq("id", item.id);
    if (!error) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, is_locked: !i.is_locked } : i,
        ),
      );
    }
  }

  async function handleAddYear() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("history_items")
      .insert({
        user_id: user.id,
        year: addYear,
        annual_gci: parseFloat(addGCI) || 0,
        annual_tx: parseInt(addTx) || 0,
        quarter_gci: [0, 0, 0, 0],
        quarter_tx: [0, 0, 0, 0],
      })
      .select()
      .single();

    if (!error && data) {
      setItems((prev) => [data, ...prev].sort((a, b) => b.year - a.year));
      setAddOpen(false);
      setAddGCI("");
      setAddTx("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">
            Year-by-year performance history
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add Year
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add History Year</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Year</Label>
                <Input
                  type="number"
                  value={addYear}
                  onChange={(e) => setAddYear(parseInt(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Annual GCI ($)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={addGCI}
                  onChange={(e) => setAddGCI(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Total Transactions</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={addTx}
                  onChange={(e) => setAddTx(e.target.value)}
                />
              </div>
              <Button onClick={handleAddYear}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No history years yet. Add your first year to improve projections.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isOpen = expanded.has(item.id);
            const yearTx = txByYear[item.year] ?? [];
            const derivedGCI = yearTx.reduce(
              (sum, tx) => sum + computeGCI(tx),
              0,
            );

            return (
              <Card key={item.id}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <CardTitle className="text-base">{item.year}</CardTitle>
                      {item.is_locked && (
                        <Badge variant="outline" className="text-xs">
                          Locked
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-semibold">
                        {fmtCurrency(item.annual_gci)}
                      </span>
                      <span className="text-muted-foreground">
                        {item.annual_tx} deals
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4 text-center text-sm">
                      {["Q1", "Q2", "Q3", "Q4"].map((q, i) => (
                        <div key={q}>
                          <p className="text-muted-foreground">{q}</p>
                          <p className="font-medium">
                            {fmtCurrency(
                              (item.quarter_gci as number[])[i] ?? 0,
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(item.quarter_tx as number[])[i] ?? 0} deals
                          </p>
                        </div>
                      ))}
                    </div>
                    {yearTx.length > 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Transaction-derived GCI: {fmtCurrency(derivedGCI)} from{" "}
                        {yearTx.length} deals
                      </p>
                    )}
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLock(item);
                        }}
                      >
                        {item.is_locked ? (
                          <>
                            <Unlock className="mr-1 h-3 w-3" /> Unlock
                          </>
                        ) : (
                          <>
                            <Lock className="mr-1 h-3 w-3" /> Lock
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
