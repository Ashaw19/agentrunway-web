/**
 * ConsentCard: the client's CASL consent badge on the client detail sheet,
 * with a Record consent action (CASL consent ledger, 00183).
 *
 * Capture, so it belongs on the phone (mobile-vs-web scope): the agent
 * records a yes ("they said yes on the call") or a stop ("they replied STOP
 * to my text") where it happens. The full ledger and its history are on the
 * web client profile (Overview → Consent).
 *
 * Status: consentStatus() in packages/core, the same answer every drafter
 * reads. Writes: recordClientConsent / withdrawClientConsent in
 * packages/core/lib/consent-writes.ts, the same writers the web and Flight
 * Crew use, with the phone's own calendar day. Method and date are required.
 * The form sits inline in the detail sheet: a sheet over a sheet is
 * unreliable on iOS.
 */

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useColors, Space, Radius, Type } from "@/lib/theme";
import { Badge, Button } from "@/components/ui";
import { DateField } from "@/components/ui/DateField";
import { useToastStore } from "@/stores/toast-store";
import {
  CONSENT_METHODS,
  consentStatus,
  formatConsentDay,
  type ChannelConsent,
  type ConsentChannel,
  type ConsentMethod,
  type ConsentStatus,
} from "@agent-runway/core/engines/casl-consent-engine";
import { localConsentClock, localDayOf } from "@agent-runway/core/lib/consent-ledger";
import { loadClientConsent, recordClientConsent, withdrawClientConsent } from "@agent-runway/core/lib/consent-writes";

type Mode = "yes" | "stop";

export function ConsentCard({ clientId }: { clientId: string }) {
  const c = useColors();
  const { t } = useTranslation("clients");
  const showToast = useToastStore((s) => s.show);

  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<Mode>("yes");
  const [channels, setChannels] = useState<ConsentChannel[]>(["email"]);
  const [basis, setBasis] = useState<"express" | "implied_inquiry">("express");
  const [method, setMethod] = useState<ConsentMethod | "">("");
  const [date, setDate] = useState("");
  const [wording, setWording] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");
      setUserId(user.id);
      const data = await loadClientConsent(supabase, user.id, clientId);
      setStatus(data ? consentStatus({ ...data.inputs, today: localConsentClock().today, dayOf: localDayOf }) : null);
      if (!data) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const color = (ch: ChannelConsent) =>
    ch.state === "express" ? c.success
      : ch.state === "implied" ? c.blue
      : ch.state === "lapsed" ? c.warning
      : ch.state === "opted_out" ? c.danger
      : c.textDim;

  const label = (ch: ChannelConsent) =>
    ch.state === "implied"
      ? t("consent.state.implied", { date: formatConsentDay(ch.impliedUntil) })
      : t(`consent.state.${ch.state}`);

  function start(next: Mode) {
    setMode(next);
    setChannels(next === "stop" ? ["email", "sms"] : ["email"]);
    setBasis("express");
    setMethod("");
    setDate("");
    setWording("");
    setNote("");
    setOpen(true);
  }

  async function save() {
    if (!userId) return;
    if (!method || !date) {
      showToast(t("consent.required"), "error");
      return;
    }
    setSaving(true);
    try {
      const clock = localConsentClock();
      const res = mode === "yes"
        ? await recordClientConsent(supabase, userId, { clientId, channels, basis, method, date, wording, note, recordedVia: "mobile" }, clock)
        : await withdrawClientConsent(supabase, userId, { clientId, channels, method, date, note, recordedVia: "mobile" }, clock);
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      showToast(res.warning ? `${res.message} ${res.warning}` : res.message, res.warning ? "info" : "success");
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const pill = (text: string, active: boolean, onPress: () => void, key?: string) => (
    <Pressable
      key={key ?? text}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: Space.md,
        minHeight: 32,
        borderRadius: Radius.pill,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: active ? c.primary : c.cardBorder,
        backgroundColor: active ? c.primaryDim : c.card,
      }}
    >
      <Text style={[Type.caption, { color: active ? c.primary : c.textMuted, fontWeight: "600" }]}>{text}</Text>
    </Pressable>
  );

  const inputStyle = [
    Type.body,
    {
      color: c.text,
      padding: Space.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.cardBorder,
      backgroundColor: c.card,
    },
  ];

  return (
    <View style={{ gap: Space.sm, padding: Space.md, borderRadius: Radius.md, borderWidth: 1, borderColor: c.cardBorder, backgroundColor: c.card, marginBottom: Space.lg }}>
      <Text style={[Type.label, { color: c.textMuted }]}>{t("consent.title")}</Text>

      {loading ? (
        <ActivityIndicator size="small" color={c.primary} />
      ) : failed || !status ? (
        <Pressable onPress={() => void load()}>
          <Text style={[Type.caption, { color: c.textDim }]}>{t("consent.loadFailed")}</Text>
        </Pressable>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm, alignItems: "center" }}>
            <Text style={[Type.caption, { color: c.textMuted }]}>{t("consent.email")}</Text>
            <Badge label={label(status.email)} color={color(status.email)} size="sm" />
            <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.sm }]}>{t("consent.texts")}</Text>
            <Badge label={label(status.sms)} color={color(status.sms)} size="sm" />
          </View>

          {!open ? (
            <View style={{ flexDirection: "row", gap: Space.sm }}>
              {pill(t("consent.record"), false, () => start("yes"), "record")}
              {pill(t("consent.recordStop"), false, () => start("stop"), "stop")}
            </View>
          ) : (
            <View style={{ gap: Space.sm }}>
              <View style={{ flexDirection: "row", gap: Space.sm }}>
                {pill(t("consent.saidYes"), mode === "yes", () => setMode("yes"), "yes")}
                {pill(t("consent.saidStop"), mode === "stop", () => setMode("stop"), "stopMode")}
              </View>
              <Text style={[Type.caption, { color: c.textDim }]}>
                {mode === "yes" ? t("consent.rule") : t("consent.stopRule")}
              </Text>

              {mode === "yes" && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
                  {pill(t("consent.basisExpress"), basis === "express", () => setBasis("express"), "express")}
                  {pill(t("consent.basisInquiry"), basis === "implied_inquiry", () => setBasis("implied_inquiry"), "inquiry")}
                </View>
              )}

              <Text style={[Type.caption, { color: c.textMuted }]}>{t("consent.channels")}</Text>
              <View style={{ flexDirection: "row", gap: Space.sm }}>
                {(["email", "sms"] as const).map((ch) =>
                  pill(
                    ch === "email" ? t("consent.email") : t("consent.texts"),
                    channels.includes(ch),
                    () => setChannels((prev) => (prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch])),
                    `ch-${ch}`,
                  ),
                )}
              </View>

              <Text style={[Type.caption, { color: c.textMuted }]}>{t("consent.how")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
                {CONSENT_METHODS.map((m) => pill(t(`consent.methods.${m}`), method === m, () => setMethod(m), `m-${m}`))}
              </View>

              <DateField label={t("consent.when")} value={date} onChange={setDate} clearable placeholder={t("consent.pickDate")} />

              {mode === "yes" && (
                <TextInput
                  value={wording}
                  onChangeText={setWording}
                  placeholder={basis === "express" ? t("consent.wording") : t("consent.inquiryWording")}
                  placeholderTextColor={c.textFaint}
                  multiline
                  maxLength={1000}
                  style={[...inputStyle, { minHeight: 60, textAlignVertical: "top" }]}
                />
              )}
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={mode === "yes" ? t("consent.note") : t("consent.stopNote")}
                placeholderTextColor={c.textFaint}
                maxLength={1000}
                style={inputStyle}
              />

              <Button
                label={saving ? t("consent.saving") : t("consent.save")}
                variant="primary"
                loading={saving}
                disabled={saving || !method || !date || channels.length === 0}
                onPress={save}
              />
              <Pressable onPress={() => setOpen(false)} disabled={saving}>
                <Text style={[Type.bodyBold, { color: c.textMuted, textAlign: "center" }]}>{t("consent.cancel")}</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}
