/**
 * Fill in from Contacts — More → Fill in from Contacts.
 *
 * Reads the phone's address book on the device (expo-contacts, after the
 * agent allows it), matches it to the agent's clients with the shared rules
 * in core/lib/contact-match.ts, and lists the phone numbers, emails and
 * birthdays the clients are missing. Every proposed change starts ticked;
 * the agent unticks anything wrong and taps Apply. Only the ticked values
 * are saved, through the store's updateClient. Contacts never leave the
 * phone otherwise, and nothing about them is logged.
 */

import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { CheckCircle2, Circle, Contact, Info } from "lucide-react-native";
import {
  type ContactMatchResult,
  type FieldUpdate,
  matchContactsToClients,
} from "@agent-runway/core/lib/contact-match";
import { readDeviceContacts } from "@/lib/device-contacts";
import { useDataStore, type Client } from "@/stores/data-store";
import { Button } from "@/components/ui";
import { useColors, useTheme, shadows, Space, Radius, Type } from "@/lib/theme";

type Phase = "intro" | "reading" | "review" | "applying" | "done";

const FIELD_LABEL: Record<FieldUpdate["field"], string> = {
  phone: "Phone",
  email: "Email",
  birthdate: "Birthday",
};

/** "clientId:field" for each ticked change. */
const key = (clientId: string, field: string) => `${clientId}:${field}`;

export default function ContactsFillScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const router = useRouter();
  const { clients, fetchClients, updateClient } = useDataStore();

  const [phase, setPhase] = useState<Phase>("intro");
  const [result, setResult] = useState<ContactMatchResult | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  const readContacts = useCallback(async () => {
    setPhase("reading");
    try {
      const deviceContacts = await readDeviceContacts(
        "Allow Agent Runway to read your contacts in Settings to fill in your clients' details.",
      );
      if (!deviceContacts) {
        setPhase("intro");
        return;
      }
      // The full client list, so every client can be matched.
      await fetchClients();
      // A person needs a name to be matched to a client.
      const named = deviceContacts.filter((d) => d.name);
      const all = useDataStore.getState().clients as Client[];
      const r = matchContactsToClients(named, all);
      setResult(r);
      setTicked(new Set(r.matches.flatMap((m) => m.updates.map((u) => key(m.clientId, u.field)))));
      setPhase("review");
    } catch {
      Alert.alert("Couldn't Read Contacts", "Please try again.");
      setPhase("intro");
    }
  }, [fetchClients]);

  const toggle = useCallback((k: string) => {
    Haptics.selectionAsync();
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const tickedCount = ticked.size;
  const clientsToUpdate = useMemo(
    () => (result?.matches ?? []).filter((m) => m.updates.some((u) => ticked.has(key(m.clientId, u.field)))),
    [result, ticked],
  );

  const apply = useCallback(async () => {
    if (!result) return;
    setPhase("applying");
    let failed = 0;
    setProgress({ done: 0, total: clientsToUpdate.length, failed: 0 });
    for (let i = 0; i < clientsToUpdate.length; i++) {
      const m = clientsToUpdate[i];
      const updates: Parameters<typeof updateClient>[1] = {};
      for (const u of m.updates) {
        if (!ticked.has(key(m.clientId, u.field))) continue;
        if (u.field === "phone") {
          updates.phone = u.value;
          if (u.phoneType) updates.phone_type = u.phoneType;
        } else if (u.field === "email") {
          updates.email = u.value;
        } else {
          updates.birthdate = u.value;
        }
      }
      const ok = await updateClient(m.clientId, updates);
      if (!ok) failed++;
      setProgress({ done: i + 1, total: clientsToUpdate.length, failed });
    }
    Haptics.notificationAsync(failed ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
    setPhase("done");
  }, [result, clientsToUpdate, ticked, updateClient]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const card = {
    padding: Space.lg,
    borderRadius: Radius.xl,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.cardBorder,
    gap: Space.sm,
    ...sh.card,
  } as const;

  if (phase === "intro" || phase === "reading") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
        <ScrollView contentContainerStyle={{ padding: Space.xl, gap: Space.lg }}>
          <View style={[card, { alignItems: "center", gap: Space.md }]}>
            <Contact size={32} color={c.primary} />
            <Text style={[Type.h3, { color: c.text, textAlign: "center" }]}>Fill in your clients from Contacts</Text>
            <Text style={[Type.body, { color: c.textDim, textAlign: "center", lineHeight: 22 }]}>
              Agent Runway compares your iPhone contacts with your {clients.length || ""} clients and suggests the phone
              numbers, emails and birthdays they&apos;re missing. You review every change before anything is saved.
            </Text>
          </View>
          <View style={card}>
            {[
              "Matches by a number or email you already have, or by full name.",
              "Only fills empty fields. A different number or email in Contacts is shown, never swapped in.",
              "If two contacts could be the same client, it asks you instead of guessing.",
              "Your contacts are read on this phone. Only the details you approve are saved.",
            ].map((line) => (
              <View key={line} style={{ flexDirection: "row", gap: Space.sm }}>
                <Info size={14} color={c.textDim} style={{ marginTop: 3 }} />
                <Text style={[Type.caption, { color: c.textMuted, flex: 1, lineHeight: 18 }]}>{line}</Text>
              </View>
            ))}
          </View>
          {phase === "reading" ? (
            <View style={{ alignItems: "center", gap: Space.sm, paddingVertical: Space.lg }}>
              <ActivityIndicator color={c.primary} />
              <Text style={[Type.caption, { color: c.textDim }]}>Reading your contacts…</Text>
            </View>
          ) : (
            <Button label="Read My Contacts" variant="primary" onPress={readContacts} />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === "applying" || phase === "done") {
    const saved = progress.done - progress.failed;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
        <View style={{ padding: Space.xl, gap: Space.lg }}>
          <View style={[card, { alignItems: "center", gap: Space.md }]}>
            {phase === "applying" ? (
              <>
                <ActivityIndicator color={c.primary} />
                <Text style={[Type.body, { color: c.textMuted }]}>
                  Updating {progress.done} of {progress.total}…
                </Text>
              </>
            ) : (
              <>
                <CheckCircle2 size={32} color={c.success} />
                <Text style={[Type.h3, { color: c.text, textAlign: "center" }]}>
                  Updated {saved} client{saved === 1 ? "" : "s"}
                </Text>
                {progress.failed > 0 && (
                  <Text style={[Type.caption, { color: c.danger, textAlign: "center" }]}>
                    {progress.failed} couldn&apos;t be saved. Check your connection and run this again; anything already
                    filled in won&apos;t be suggested twice.
                  </Text>
                )}
              </>
            )}
          </View>
          {phase === "done" && <Button label="Done" variant="primary" onPress={() => router.back()} />}
        </View>
      </SafeAreaView>
    );
  }

  // Review
  const matches = result?.matches ?? [];
  const ambiguous = result?.ambiguous ?? [];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: Space.xl, gap: Space.md, paddingBottom: 120 }}>
        <Text style={[Type.label, { color: c.textMuted }]}>
          {matches.length
            ? `${matches.length} CLIENT${matches.length === 1 ? "" : "S"} CAN BE FILLED IN`
            : "NOTHING TO FILL IN"}
        </Text>
        {matches.length === 0 && (
          <Text style={[Type.body, { color: c.textDim, lineHeight: 22 }]}>
            {result?.upToDate
              ? `${result.upToDate} client${result.upToDate === 1 ? "" : "s"} matched a contact and already have everything Contacts has.`
              : "None of your contacts matched a client by name, number or email."}
          </Text>
        )}

        {matches.map((m) => (
          <View key={m.clientId} style={card}>
            <Text style={[Type.bodyBold, { color: c.text }]}>{m.clientName}</Text>
            {m.contactName !== m.clientName && (
              <Text style={[Type.micro, { color: c.textDim }]}>From contact “{m.contactName}”</Text>
            )}
            {m.updates.map((u) => {
              const k = key(m.clientId, u.field);
              const on = ticked.has(k);
              return (
                <Pressable
                  key={k}
                  onPress={() => toggle(k)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={{ flexDirection: "row", alignItems: "center", gap: Space.sm, paddingVertical: 4 }}
                >
                  {on ? <CheckCircle2 size={20} color={c.primary} /> : <Circle size={20} color={c.textDim} />}
                  <Text style={[Type.caption, { color: c.textMuted, width: 64 }]}>{FIELD_LABEL[u.field]}</Text>
                  <Text style={[Type.body, { color: c.text, flex: 1 }]} numberOfLines={1}>
                    {u.display}
                  </Text>
                </Pressable>
              );
            })}
            {m.differences.map((d) => (
              <Text key={d} style={[Type.micro, { color: c.textDim }]}>
                {d} (not changed)
              </Text>
            ))}
          </View>
        ))}

        {ambiguous.length > 0 && (
          <View style={[card, { gap: 4 }]}>
            <Text style={[Type.bodyBold, { color: c.text }]}>Not filled in: more than one possible contact</Text>
            <Text style={[Type.caption, { color: c.textDim, lineHeight: 18 }]}>
              Add a phone number or email to these clients in Agent Runway, then run this again so it can tell which
              contact is theirs.
            </Text>
            {ambiguous.map((a) => (
              <Text key={a.clientId} style={[Type.caption, { color: c.textMuted }]}>
                {a.clientName}: {a.contactNames.length} possible contacts
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      {matches.length > 0 && (
        <View style={{ position: "absolute", left: Space.xl, right: Space.xl, bottom: Space.xl }}>
          <Button
            label={tickedCount ? `Apply ${tickedCount} change${tickedCount === 1 ? "" : "s"} to ${clientsToUpdate.length} client${clientsToUpdate.length === 1 ? "" : "s"}` : "Nothing selected"}
            variant="primary"
            disabled={tickedCount === 0}
            onPress={apply}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
