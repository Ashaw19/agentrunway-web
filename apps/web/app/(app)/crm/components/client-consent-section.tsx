"use client";

/**
 * Consent section on the client profile (Overview tab): the client's CASL
 * consent per channel and the ledger behind it, with Record consent and
 * Record withdrawal (CASL consent ledger, 00183).
 *
 * Status: consentStatus() in packages/core/engines/casl-consent-engine.ts,
 * the same answer every drafter reads. Writes: recordClientConsent /
 * withdrawClientConsent in packages/core/lib/consent-writes.ts, the same
 * writers the phone and Flight Crew use. Method and date are required
 * (CASL s.13: whoever relies on consent has the onus of proving it).
 * Only the agent records consent here: Agent Runway never infers it from
 * notes, replies or activity. Days are Atlantic calendar days, as on the
 * server (the date picker's "today" and every date shown).
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CRM_SECTION_CARD, CRM_SECTION_HEADER, CRM_SECTION_ICON_CHIP } from "@/components/cockpit-ui";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  CASL_IMPLIED_CONSENT_MONTHS,
  CASL_INQUIRY_CONSENT_MONTHS,
  CONSENT_CHANNEL_LABELS,
  CONSENT_METHOD_LABELS,
  CONSENT_METHODS,
  consentStateLabel,
  consentStatus,
  formatConsentDay,
  type ChannelConsent,
  type ConsentChannel,
  type ConsentState,
  type ConsentStatus,
} from "@agent-runway/core/engines/casl-consent-engine";
import { atlanticConsentClock } from "@agent-runway/core/lib/consent-ledger";
import { atlanticISODate } from "@agent-runway/core/lib/local-date";
import {
  loadClientConsent,
  recordClientConsent,
  withdrawClientConsent,
  type ClientConsentData,
  type ConsentWriteResult,
} from "@agent-runway/core/lib/consent-writes";
import type { RecordConsentInput, WithdrawConsentInput } from "@agent-runway/core/lib/consent-ledger";

const STATE_STYLE: Record<ConsentState, string> = {
  express:   "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  implied:   "bg-sky-500/10 text-sky-600 ring-sky-500/30 dark:text-sky-400",
  lapsed:    "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400",
  opted_out: "bg-red-500/10 text-red-600 ring-red-500/30 dark:text-red-400",
  no_record: "bg-muted text-muted-foreground ring-border",
};

const KIND_LABEL: Record<string, string> = {
  alerts: "listing alerts",
  market_letter: "monthly market letter",
  home_report: "monthly home report",
  open_house: "open house follow-up emails",
  guide: "guide emails",
  other: "website emails",
};

type Mode = null | "record" | "withdraw";

/** A stored instant as its Atlantic calendar day (APP_TIME_ZONE). */
const atlanticDay = (ts: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ts) ? ts : atlanticISODate(new Date(ts)));

function ChannelRow({ ch }: { ch: ChannelConsent }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-12 shrink-0 pt-0.5 text-[11px] font-semibold text-muted-foreground">
        {CONSENT_CHANNEL_LABELS[ch.channel]}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", STATE_STYLE[ch.state])}>
          {consentStateLabel(ch)}
        </span>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{ch.reason}</p>
      </div>
    </div>
  );
}

function ChannelPicker({ value, onChange }: { value: ConsentChannel[]; onChange: (v: ConsentChannel[]) => void }) {
  return (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="mb-1 text-[11px] font-semibold text-muted-foreground">Channels</legend>
      {(["email", "sms"] as const).map((c) => (
        <label key={c} className="inline-flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={value.includes(c)}
            onChange={(e) => onChange(e.target.checked ? [...value, c] : value.filter((x) => x !== c))}
          />
          {CONSENT_CHANNEL_LABELS[c]}
        </label>
      ))}
    </fieldset>
  );
}

function MethodPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <select
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="" disabled>Pick one…</option>
        {CONSENT_METHODS.map((m) => (
          <option key={m} value={m}>{CONSENT_METHOD_LABELS[m]}</option>
        ))}
      </select>
    </label>
  );
}

/** Loads the client's consent and writes through the shared core writers. */
export function ClientConsentSection({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [data, setData] = useState<ClientConsentData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");
      setUserId(user.id);
      setData(await loadClientConsent(supabase, user.id, clientId));
    } catch (err) {
      console.error("[consent] load failed:", err instanceof Error ? err.message : err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const submit = useCallback(async (
    input: { record: Omit<RecordConsentInput, "recordedVia"> } | { withdraw: Omit<WithdrawConsentInput, "recordedVia"> },
  ): Promise<ConsentWriteResult> => {
    if (!userId) return { ok: false, error: "Sign in again, then try." };
    const supabase = createClient();
    const res = "record" in input
      ? await recordClientConsent(supabase, userId, { ...input.record, recordedVia: "web" }, atlanticConsentClock())
      : await withdrawClientConsent(supabase, userId, { ...input.withdraw, recordedVia: "web" }, atlanticConsentClock());
    if (res.ok) await load();
    return res;
  }, [userId, load]);

  return (
    <ConsentPanel
      clientId={clientId}
      clientName={clientName}
      data={data}
      loading={loading}
      loadError={loadError}
      onRetry={() => void load()}
      onSubmit={submit}
    />
  );
}

/** The section itself, driven by props (a /demo preview renders it with made-up rows). */
export function ConsentPanel({
  clientId,
  clientName,
  data,
  loading,
  loadError,
  onRetry,
  onSubmit,
}: {
  clientId:  string;
  clientName: string;
  data:      ClientConsentData | null;
  loading:   boolean;
  loadError: boolean;
  onRetry:   () => void;
  onSubmit:  (input: { record: Omit<RecordConsentInput, "recordedVia"> } | { withdraw: Omit<WithdrawConsentInput, "recordedVia"> }) => Promise<ConsentWriteResult>;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [saving, setSaving] = useState(false);
  // Atlantic calendar days, as on the server and in every drafter.
  const status: ConsentStatus | null = data
    ? consentStatus({ ...data.inputs, today: atlanticISODate() })
    : null;

  // Form state (shared by both forms; reset when one opens)
  const [channels, setChannels] = useState<ConsentChannel[]>(["email"]);
  const [basis, setBasis] = useState<"express" | "implied_inquiry">("express");
  const [method, setMethod] = useState("");
  const [date, setDate] = useState("");
  const [wording, setWording] = useState("");
  const [note, setNote] = useState("");

  function open(next: Mode) {
    setMode(next);
    setChannels(next === "withdraw" ? ["email", "sms"] : ["email"]);
    setBasis("express");
    setMethod("");
    setDate("");
    setWording("");
    setNote("");
  }

  async function submit() {
    if (!mode) return;
    if (!method || !date) {
      toast.error("How and when are both required.");
      return;
    }
    setSaving(true);
    try {
      const res = await onSubmit(mode === "record"
        ? { record: { clientId, channels, basis, method, date, wording, note } }
        : { withdraw: { clientId, channels, method, date, note } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message, res.warning ? { description: res.warning, duration: 10000 } : undefined);
      setMode(null);
    } finally {
      setSaving(false);
    }
  }

  const today = atlanticISODate();

  return (
    <div className={CRM_SECTION_CARD}>
      <h3 className={CRM_SECTION_HEADER}>
        <div className={CRM_SECTION_ICON_CHIP}>
          <ShieldCheck className="h-3 w-3" />
        </div>
        Consent
      </h3>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading consent…
        </div>
      ) : loadError || !status || !data ? (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Couldn&apos;t load {clientName}&apos;s consent record.</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>Try again</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <ChannelRow ch={status.email} />
          <ChannelRow ch={status.sms} />

          {/* The ledger */}
          {(data.records.length > 0 || data.optOuts.email_opt_out_at || data.optOuts.sms_opt_out_at) && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium">On record ({data.records.length + (data.optOuts.email_opt_out_at ? 1 : 0) + (data.optOuts.sms_opt_out_at ? 1 : 0)})</summary>
              <ul className="mt-2 space-y-2">
                {(["email", "sms"] as const).map((c) => {
                  const at = c === "email" ? data.optOuts.email_opt_out_at : data.optOuts.sms_opt_out_at;
                  if (!at) return null;
                  const src = c === "email" ? data.optOuts.email_opt_out_source : data.optOuts.sms_opt_out_source;
                  const how = c === "email" ? data.optOuts.email_opt_out_method : data.optOuts.sms_opt_out_method;
                  return (
                    <li key={`opt-${c}`} className="rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1.5">
                      Unsubscribed from {c === "email" ? "email" : "texts"} on {formatConsentDay(atlanticDay(at))}
                      {src === "agent" ? `, recorded by you${how && how in CONSENT_METHOD_LABELS ? ` (${CONSENT_METHOD_LABELS[how as keyof typeof CONSENT_METHOD_LABELS].toLowerCase()})` : ""}` : src === "website" ? ", from your website" : ""}.
                    </li>
                  );
                })}
                {data.records.map((r) => (
                  <li key={r.id} className={cn("rounded-md border px-2 py-1.5", r.withdrawn_at ? "border-border/40 opacity-70" : "border-border/60")}>
                    <span className="font-semibold text-foreground/80">
                      {r.basis === "implied_inquiry" ? "Inquiry" : "Express consent"} · {CONSENT_CHANNEL_LABELS[(r.channel ?? "email") as ConsentChannel]}
                    </span>{" "}
                    · {formatConsentDay(atlanticDay(r.consented_at))}
                    {r.method && r.method in CONSENT_METHOD_LABELS ? ` · ${CONSENT_METHOD_LABELS[r.method as keyof typeof CONSENT_METHOD_LABELS]}` : ""}
                    {" · "}
                    {r.source === "website" ? `Website sign-up: ${KIND_LABEL[r.kind] ?? r.kind}` : "Recorded by you"}
                    {r.consent_text && <p className="mt-0.5 italic">&ldquo;{r.consent_text}&rdquo;</p>}
                    {r.evidence_note && <p className="mt-0.5">Note: {r.evidence_note}</p>}
                    {r.withdrawn_at && (
                      <p className="mt-0.5">Withdrawn {formatConsentDay(atlanticDay(r.withdrawn_at))}{r.withdrawn_note ? `: ${r.withdrawn_note}` : ""}</p>
                    )}
                  </li>
                ))}
              </ul>
              {data.records.some((r) => r.source === "website") && (
                <p className="mt-2">A website sign-up covers the list they joined, so it doesn&apos;t open personal emails or texts by itself.</p>
              )}
            </details>
          )}

          {mode === null && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => open("record")}>Record consent</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => open("withdraw")}>Record withdrawal</Button>
            </div>
          )}

          {mode === "record" && (
            <form
              className="space-y-2.5 rounded-lg border border-border/60 bg-muted/30 p-3"
              onSubmit={(e) => { e.preventDefault(); void submit(); }}
            >
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Under CASL, implied consent from a purchase lasts {CASL_IMPLIED_CONSENT_MONTHS / 12} years and from an
                inquiry {CASL_INQUIRY_CONSENT_MONTHS} months. Express consent has no end date: it lasts until they
                withdraw it. Record only what {clientName} told you; Agent Runway never infers consent from notes or replies.
              </p>
              <fieldset className="flex flex-wrap gap-3">
                <legend className="mb-1 text-[11px] font-semibold text-muted-foreground">What they gave</legend>
                <label className="inline-flex items-center gap-1.5 text-xs">
                  <input type="radio" name="basis" checked={basis === "express"} onChange={() => setBasis("express")} />
                  Express consent (they said yes)
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs">
                  <input type="radio" name="basis" checked={basis === "implied_inquiry"} onChange={() => setBasis("implied_inquiry")} />
                  An inquiry (implied, {CASL_INQUIRY_CONSENT_MONTHS} months)
                </label>
              </fieldset>
              <ChannelPicker value={channels} onChange={setChannels} />
              <div className="grid grid-cols-2 gap-2">
                <MethodPicker value={method} onChange={setMethod} label="How (required)" />
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">When (required)</span>
                  <Input type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {basis === "express" ? "What they agreed to, in their words if you have them" : "What they asked about"}
                </span>
                <Textarea rows={2} value={wording} onChange={(e) => setWording(e.target.value)} className="text-xs resize-none" maxLength={1000} />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Note: where the proof is (a saved email, a signed form)</span>
                <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs" maxLength={1000} />
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm" className="h-7 text-xs" disabled={saving || !method || !date || channels.length === 0}>
                  {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : "Save consent"}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={saving} onClick={() => setMode(null)}>Cancel</Button>
              </div>
            </form>
          )}

          {mode === "withdraw" && (
            <form
              className="space-y-2.5 rounded-lg border border-red-500/20 bg-red-500/5 p-3"
              onSubmit={(e) => { e.preventDefault(); void submit(); }}
            >
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {clientName} asked to stop getting messages. Agent Runway won&apos;t draft emails or texts on the channels you
                pick, and drafts already waiting for them are skipped. Under CASL an unsubscribe takes effect without
                delay, within 10 business days at the latest.
              </p>
              <ChannelPicker value={channels} onChange={setChannels} />
              <div className="grid grid-cols-2 gap-2">
                <MethodPicker value={method} onChange={setMethod} label="How they asked (required)" />
                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">When (required)</span>
                  <Input type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Note (optional)</span>
                <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs" maxLength={1000} />
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="destructive" className="h-7 text-xs" disabled={saving || !method || !date || channels.length === 0}>
                  {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : "Save withdrawal"}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={saving} onClick={() => setMode(null)}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
