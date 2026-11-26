"use client";

/**
 * Add Opportunity dialog — 3-tab capture (Listing Appointment / Buyer Prospect
 * / Referral). Each tab writes directly to its canonical table (mirrors the
 * existing listing-appointment insert in pipeline-content.tsx):
 *   - listing_appointment → listing_appointments (status 'scheduled')
 *   - buyer_prospect      → pipeline_deals (side 'buyer', stage 'lead')
 *   - referral            → referral_opportunities (status 'open')
 *
 * Clients are chosen by name (ClientNameField). user_id is always set from
 * supabase.auth.getUser().
 *
 * Edit mode (`editing` set, 2026-11-26): Andrew couldn't change an open
 * opportunity from the Pipeline page. The same form opens on that row's tab,
 * filled from its own table, and saves with an UPDATE by id + user_id. Status,
 * stage and conversion links are never touched here (Promote / Advance / Lost
 * own those).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { fmtCurrency } from "@/lib/formatters";
import { supabaseErrorMessage } from "@/lib/crm/opportunity-form";
import { ClientNameField, NO_CLIENT, keepEscapeForClientList } from "@/components/client-name-field";
import type { OpportunityV, ReferralType } from "@/lib/types/database";

type Tab = "listing_appointment" | "buyer_prospect" | "referral";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A stored fraction (0.25) as the form's percent text ("25"); null → "". */
function pctText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "";
  return String(Math.round(Number(v) * 10000) / 100);
}

/** A stored number as form text; null → "". */
function numText(v: number | null | undefined): string {
  return v == null || !Number.isFinite(Number(v)) ? "" : String(v);
}

/** Parse a numeric form field; empty / non-finite → null. */
function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}


export function AddOpportunityDialog({
  open,
  onOpenChange,
  onSaved,
  editing = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful insert or update — caller does router.refresh(). */
  onSaved: () => void;
  /** An open opportunity to edit. Null (the default) adds a new one. */
  editing?: OpportunityV | null;
}) {
  const [tab, setTab] = useState<Tab>("listing_appointment");
  const [saving, setSaving] = useState(false);
  /** Edit mode: true until the row's own fields have loaded into the form. */
  const [loadingRow, setLoadingRow] = useState(false);

  // ── Listing Appointment form ───────────────────────────────────────────
  const [la, setLa] = useState({
    client: NO_CLIENT,
    property_address: "",
    appointment_date: todayLocal(),
    estimated_list_price: "",
    estimated_commission_pct: "2.5",
    close_odds_pct: "40",
    expected_close_date: "",
    notes: "",
  });

  // ── Buyer Prospect form ────────────────────────────────────────────────
  const [bp, setBp] = useState({
    client: NO_CLIENT,
    address: "",
    estimated_price: "",
    estimated_commission_pct: "2.5",
    close_odds_pct: "25",
    expected_close_date: "",
    notes: "",
  });

  // ── Referral form ──────────────────────────────────────────────────────
  const [rf, setRf] = useState({
    referred_person_name: "",
    referrer: NO_CLIENT,
    referral_type: "unknown" as ReferralType,
    referral_date: todayLocal(),
    estimated_price: "",
    estimated_commission_pct: "2.5",
    close_odds_pct: "20",
    expected_close_date: "",
    notes: "",
  });

  const resetForms = useCallback(() => {
    setLa({
      client: NO_CLIENT,
      property_address: "",
      appointment_date: todayLocal(),
      estimated_list_price: "",
      estimated_commission_pct: "2.5",
      close_odds_pct: "40",
      expected_close_date: "",
      notes: "",
    });
    setBp({
      client: NO_CLIENT,
      address: "",
      estimated_price: "",
      estimated_commission_pct: "2.5",
      close_odds_pct: "25",
      expected_close_date: "",
      notes: "",
    });
    setRf({
      referred_person_name: "",
      referrer: NO_CLIENT,
      referral_type: "unknown",
      referral_date: todayLocal(),
      estimated_price: "",
      estimated_commission_pct: "2.5",
      close_odds_pct: "20",
      expected_close_date: "",
      notes: "",
    });
  }, []);

  // Edit mode: read the row from its own table (the view lacks the address,
  // referrer and referral type) and fill that tab's form.
  useEffect(() => {
    if (!open || !editing) return;
    let cancelled = false;
    setTab(editing.opportunity_type);
    setLoadingRow(true);
    (async () => {
      try {
        const supabase = createClient();
        const clientName = async (id: string | null): Promise<string> => {
          if (!id) return "";
          const { data, error } = await supabase.from("clients").select("name").eq("id", id).maybeSingle();
          if (error) throw error;
          return (data?.name as string | undefined) ?? "";
        };
        if (editing.opportunity_type === "listing_appointment") {
          const { data: r, error } = await supabase.from("listing_appointments").select("*").eq("id", editing.id).single();
          if (error) throw error;
          const name = await clientName(r.client_id);
          if (cancelled) return;
          setLa({
            client: r.client_id ? { id: r.client_id, name } : NO_CLIENT,
            property_address: r.property_address ?? "",
            appointment_date: r.appointment_date ?? todayLocal(),
            estimated_list_price: numText(r.estimated_list_price),
            estimated_commission_pct: pctText(r.estimated_commission_pct ?? 0.025),
            close_odds_pct: pctText(r.close_odds_pct),
            expected_close_date: r.expected_close_date ?? "",
            notes: r.notes ?? "",
          });
        } else if (editing.opportunity_type === "buyer_prospect") {
          const { data: r, error } = await supabase.from("pipeline_deals").select("*").eq("id", editing.id).single();
          if (error) throw error;
          const name = r.client_id ? (await clientName(r.client_id)) || r.client_name || "" : r.client_name || "";
          if (cancelled) return;
          setBp({
            client: { id: r.client_id ?? null, name },
            address: r.address ?? "",
            estimated_price: numText(r.estimated_price),
            estimated_commission_pct: pctText(r.estimated_commission_pct ?? 0.025),
            close_odds_pct: pctText(r.probability_override),
            expected_close_date: r.expected_close_date ?? "",
            notes: r.notes ?? "",
          });
        } else {
          const { data: r, error } = await supabase.from("referral_opportunities").select("*").eq("id", editing.id).single();
          if (error) throw error;
          const name = r.referrer_client_id ? (await clientName(r.referrer_client_id)) || r.referrer_name || "" : r.referrer_name || "";
          if (cancelled) return;
          setRf({
            referred_person_name: r.referred_person_name ?? "",
            referrer: { id: r.referrer_client_id ?? null, name },
            referral_type: (r.referral_type ?? "unknown") as ReferralType,
            referral_date: r.referral_date ?? todayLocal(),
            estimated_price: numText(r.estimated_price),
            estimated_commission_pct: pctText(r.estimated_commission_pct ?? 0.025),
            close_odds_pct: pctText(r.close_odds_pct),
            expected_close_date: r.expected_close_date ?? "",
            notes: r.notes ?? "",
          });
        }
        if (!cancelled) setLoadingRow(false);
      } catch (err) {
        if (cancelled) return;
        toast.error(supabaseErrorMessage(err, "Couldn't load this opportunity."));
        console.error(err);
        onOpenChange(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, editing, onOpenChange]);

  function oddsFraction(v: string): number | null {
    const n = num(v);
    if (n == null) return null;
    if (n < 0 || n > 100) return null;
    return n / 100;
  }

  function commissionFraction(v: string): number | null {
    const n = num(v);
    if (n == null) return null;
    if (n < 0 || n > 50) return null;
    return n / 100;
  }

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (tab === "listing_appointment") {
        if (!la.property_address.trim()) {
          toast.error("Property address is required.");
          return;
        }
        const odds = oddsFraction(la.close_odds_pct);
        if (la.close_odds_pct.trim() !== "" && odds == null) {
          toast.error("Close odds must be between 0 and 100.");
          return;
        }
        const comm = commissionFraction(la.estimated_commission_pct);
        if (la.estimated_commission_pct.trim() !== "" && comm == null) {
          toast.error("Commission must be between 0% and 50%.");
          return;
        }
        if (la.client.name.trim() && !la.client.id) {
          toast.error("Pick the client from the list, or clear the Client box.");
          return;
        }
        const fields = {
          client_id: la.client.id,
          property_address: la.property_address.trim(),
          appointment_date: la.appointment_date || todayLocal(),
          estimated_list_price: num(la.estimated_list_price),
          estimated_commission_pct: comm ?? 0.025,
          close_odds_pct: odds,
          expected_close_date: la.expected_close_date || null,
          notes: la.notes.trim() || null,
        };
        const { error } = editing
          ? await supabase.from("listing_appointments").update(fields).eq("id", editing.id).eq("user_id", user.id)
          : await supabase.from("listing_appointments").insert({ ...fields, user_id: user.id, status: "scheduled" });
        if (error) throw error;
        toast.success(editing ? "Listing appointment updated." : "Listing appointment logged.");
      } else if (tab === "buyer_prospect") {
        if (!bp.client.name.trim()) {
          toast.error("A client is required for a buyer prospect.");
          return;
        }
        if (!bp.client.id) {
          toast.error("Pick the client from the list.");
          return;
        }
        const odds = oddsFraction(bp.close_odds_pct);
        if (bp.close_odds_pct.trim() !== "" && odds == null) {
          toast.error("Close odds must be between 0 and 100.");
          return;
        }
        const comm = commissionFraction(bp.estimated_commission_pct);
        if (bp.estimated_commission_pct.trim() !== "" && comm == null) {
          toast.error("Commission must be between 0% and 50%.");
          return;
        }
        const fields = {
          client_id: bp.client.id,
          address: bp.address.trim() || "",
          client_name: bp.client.name.trim(),
          estimated_price: num(bp.estimated_price) ?? 0,
          estimated_commission_pct: comm ?? 0.025,
          probability_override: odds,
          expected_close_date: bp.expected_close_date || null,
          notes: bp.notes.trim() || "",
        };
        const { error } = editing
          ? await supabase.from("pipeline_deals").update(fields).eq("id", editing.id).eq("user_id", user.id)
          : await supabase.from("pipeline_deals").insert({ ...fields, user_id: user.id, side: "buyer", stage: "lead" });
        if (error) throw error;
        toast.success(editing ? "Buyer prospect updated." : "Buyer prospect logged.");
      } else {
        if (!rf.referred_person_name.trim()) {
          toast.error("Referred person name is required.");
          return;
        }
        const odds = oddsFraction(rf.close_odds_pct);
        if (rf.close_odds_pct.trim() !== "" && odds == null) {
          toast.error("Close odds must be between 0 and 100.");
          return;
        }
        const comm = commissionFraction(rf.estimated_commission_pct);
        if (rf.estimated_commission_pct.trim() !== "" && comm == null) {
          toast.error("Commission must be between 0% and 50%.");
          return;
        }
        const fields = {
          referred_person_name: rf.referred_person_name.trim(),
          referrer_name: rf.referrer.name.trim() || null,
          referrer_client_id: rf.referrer.id,
          referral_type: rf.referral_type,
          referral_date: rf.referral_date || todayLocal(),
          estimated_price: num(rf.estimated_price),
          estimated_commission_pct: comm ?? 0.025,
          close_odds_pct: odds ?? 0.2,
          expected_close_date: rf.expected_close_date || null,
          notes: rf.notes.trim() || null,
        };
        const { error } = editing
          ? await supabase.from("referral_opportunities").update(fields).eq("id", editing.id).eq("user_id", user.id)
          : await supabase.from("referral_opportunities").insert({ ...fields, user_id: user.id, status: "open" });
        if (error) throw error;
        toast.success(editing ? "Referral updated." : "Referral logged.");
      }

      resetForms();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(supabaseErrorMessage(err));
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [tab, la, bp, rf, editing, onOpenChange, onSaved, resetForms]);

  // GCI preview helper per active tab.
  const previewGci = (() => {
    if (tab === "listing_appointment") {
      const p = num(la.estimated_list_price) ?? 0;
      const c = commissionFraction(la.estimated_commission_pct) ?? 0;
      return p * c;
    }
    if (tab === "buyer_prospect") {
      const p = num(bp.estimated_price) ?? 0;
      const c = commissionFraction(bp.estimated_commission_pct) ?? 0;
      return p * c;
    }
    const p = num(rf.estimated_price) ?? 0;
    const c = commissionFraction(rf.estimated_commission_pct) ?? 0;
    return p * c;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg" onEscapeKeyDown={keepEscapeForClientList}>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Opportunity" : "Add Opportunity"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          {/* An opportunity's type can't change: editing shows only its own tab. */}
          {!editing && (
            <TabsList className="w-full">
              <TabsTrigger value="listing_appointment">Listing Appt</TabsTrigger>
              <TabsTrigger value="buyer_prospect">Buyer Prospect</TabsTrigger>
              <TabsTrigger value="referral">Referral</TabsTrigger>
            </TabsList>
          )}

          {/* ── Listing Appointment ─────────────────────────────────── */}
          <TabsContent value="listing_appointment" className="mt-3 grid gap-4">
            <div className="grid gap-1.5">
              <Label>Property Address *</Label>
              <Input
                placeholder="123 Main St"
                value={la.property_address}
                onChange={(e) => setLa({ ...la, property_address: e.target.value })}
              />
            </div>
            <ClientNameField
              label="Client (optional)"
              value={la.client}
              onChange={(client) => setLa((f) => ({ ...f, client }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Estimated List Price ($)</Label>
                <Input
                  type="number"
                  placeholder="750000"
                  value={la.estimated_list_price}
                  onChange={(e) => setLa({ ...la, estimated_list_price: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Commission %</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={la.estimated_commission_pct}
                  onChange={(e) => setLa({ ...la, estimated_commission_pct: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Appointment Date</Label>
                <Input
                  type="date"
                  value={la.appointment_date}
                  onChange={(e) => setLa({ ...la, appointment_date: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Close Odds %</Label>
                <Input
                  type="number"
                  step="5"
                  value={la.close_odds_pct}
                  onChange={(e) => setLa({ ...la, close_odds_pct: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Expected Close Date</Label>
              <Input
                type="date"
                value={la.expected_close_date}
                onChange={(e) => setLa({ ...la, expected_close_date: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={la.notes}
                onChange={(e) => setLa({ ...la, notes: e.target.value })}
              />
            </div>
          </TabsContent>

          {/* ── Buyer Prospect ──────────────────────────────────────── */}
          <TabsContent value="buyer_prospect" className="mt-3 grid gap-4">
            <ClientNameField
              label="Client *"
              value={bp.client}
              onChange={(client) => setBp((f) => ({ ...f, client }))}
            />
            <div className="grid gap-1.5">
              <Label>Target Address (optional)</Label>
              <Input
                placeholder="e.g. searching in East End"
                value={bp.address}
                onChange={(e) => setBp({ ...bp, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Budget ($)</Label>
                <Input
                  type="number"
                  placeholder="500000"
                  value={bp.estimated_price}
                  onChange={(e) => setBp({ ...bp, estimated_price: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Commission %</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={bp.estimated_commission_pct}
                  onChange={(e) => setBp({ ...bp, estimated_commission_pct: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Close Odds %</Label>
                <Input
                  type="number"
                  step="5"
                  value={bp.close_odds_pct}
                  onChange={(e) => setBp({ ...bp, close_odds_pct: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Expected Close Date</Label>
                <Input
                  type="date"
                  value={bp.expected_close_date}
                  onChange={(e) => setBp({ ...bp, expected_close_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={bp.notes}
                onChange={(e) => setBp({ ...bp, notes: e.target.value })}
              />
            </div>
          </TabsContent>

          {/* ── Referral ────────────────────────────────────────────── */}
          <TabsContent value="referral" className="mt-3 grid gap-4">
            <div className="grid gap-1.5">
              <Label>Referred Person Name *</Label>
              <Input
                placeholder="Jane Doe"
                value={rf.referred_person_name}
                onChange={(e) => setRf({ ...rf, referred_person_name: e.target.value })}
              />
            </div>
            <ClientNameField
              label="Referred by (optional)"
              value={rf.referrer}
              onChange={(referrer) => setRf((f) => ({ ...f, referrer }))}
              placeholder="Start typing a name, client or not"
              freeTextHint="Not one of your clients. The name will be saved as typed."
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Referral Type</Label>
                <Select
                  value={rf.referral_type}
                  onValueChange={(v) => setRf({ ...rf, referral_type: v as ReferralType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Referral Date</Label>
                <Input
                  type="date"
                  value={rf.referral_date}
                  onChange={(e) => setRf({ ...rf, referral_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Estimated Price ($)</Label>
                <Input
                  type="number"
                  value={rf.estimated_price}
                  onChange={(e) => setRf({ ...rf, estimated_price: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Commission %</Label>
                <Input
                  type="number"
                  step="0.25"
                  value={rf.estimated_commission_pct}
                  onChange={(e) => setRf({ ...rf, estimated_commission_pct: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Close Odds %</Label>
                <Input
                  type="number"
                  step="5"
                  value={rf.close_odds_pct}
                  onChange={(e) => setRf({ ...rf, close_odds_pct: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Expected Close Date (optional)</Label>
                <Input
                  type="date"
                  value={rf.expected_close_date}
                  onChange={(e) => setRf({ ...rf, expected_close_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={rf.notes}
                onChange={(e) => setRf({ ...rf, notes: e.target.value })}
              />
            </div>
          </TabsContent>
        </Tabs>

        {previewGci > 0 && (
          <p className="text-sm text-muted-foreground">
            Est. GCI:{" "}
            <span className="font-medium text-foreground">{fmtCurrency(previewGci)}</span>
          </p>
        )}

        <Button onClick={handleSubmit} disabled={saving || loadingRow}>
          {saving ? "Saving…" : loadingRow ? "Loading…" : editing ? "Save Changes" : "Add Opportunity"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
