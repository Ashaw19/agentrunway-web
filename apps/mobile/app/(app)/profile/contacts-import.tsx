/**
 * Import from Contacts — Clients → ⋯ menu → Import from Contacts.
 *
 * Reads the phone's address book on the device (expo-contacts), drops every
 * contact that already matches a client by phone, email or name (archived
 * clients included), and lists the rest, all ticked. Import adds the ticked
 * ones as clients: Cruising, lead source "SOI", tag "iPhone import", so they
 * can be filtered or removed together. The rules live in
 * core/lib/contact-match.ts (planContactImport). Contacts never leave the
 * phone except as the clients the agent imports.
 */

import { useCallback, useMemo, useState } from "react";
import { View, Text, SectionList, Pressable, Alert, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { CheckCircle2, Circle, UserPlus, Info } from "lucide-react-native";
import { type ImportCandidate, type ImportPlan, planContactImport } from "@agent-runway/core/lib/contact-match";
import { useDataStore, type Client, IMPORT_TAG, IMPORT_LEAD_SOURCE } from "@/stores/data-store";
import { readDeviceContacts } from "@/lib/device-contacts";
import { Button } from "@/components/ui";
import { useColors, useTheme, shadows, Space, Radius, Type } from "@/lib/theme";

type Phase = "intro" | "reading" | "review" | "importing" | "done";

function detail(c: ImportCandidate): string {
  if (c.agentReason) return c.agentReason;
  const bits = [c.phone, c.email].filter(Boolean) as string[];
  if (c.kind === "business") bits.unshift("Business");
  return bits.length ? bits.join(" · ") : "No phone or email";
}

export default function ContactsImportScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const router = useRouter();
  const { clients, fetchClients, importClients } = useDataStore();

  const [phase, setPhase] = useState<Phase>("intro");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<{ added: number; skipped: number; failed: number } | null>(null);

  const read = useCallback(async () => {
    setPhase("reading");
    try {
      const contacts = await readDeviceContacts(
        "Allow Agent Runway to read your contacts in Settings to import them as clients.",
      );
      if (!contacts) {
        setPhase("intro");
        return;
      }
      // Every client, archived ones too, so no one already here is added again.
      await fetchClients();
      const p = planContactImport(contacts, useDataStore.getState().clients as Client[]);
      setPlan(p);
      // Other real estate agents start unticked: they're not clients.
      setTicked(new Set(p.candidates.filter((x) => !x.agentReason).map((x) => x.contactId)));
      setPhase("review");
    } catch {
      Alert.alert("Couldn't Read Contacts", "Please try again.");
      setPhase("intro");
    }
  }, [fetchClients]);

  const toggle = useCallback((id: string) => {
    Haptics.selectionAsync();
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const candidates = useMemo(() => plan?.candidates ?? [], [plan]);
  const people = useMemo(() => candidates.filter((x) => !x.agentReason), [candidates]);
  const agents = useMemo(() => candidates.filter((x) => x.agentReason), [candidates]);
  // "Tick all" covers everyone except the agents; tick an agent one by one.
  const allTicked = people.length > 0 && people.every((x) => ticked.has(x.contactId));
  const chosen = useMemo(() => candidates.filter((x) => ticked.has(x.contactId)), [candidates, ticked]);

  const runImport = useCallback(() => {
    if (chosen.length === 0) return;
    Alert.alert(
      `Add ${chosen.length} client${chosen.length === 1 ? "" : "s"}?`,
      `They'll be filed as Cruising with lead source ${IMPORT_LEAD_SOURCE} and the tag "${IMPORT_TAG}".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add",
          onPress: async () => {
            setPhase("importing");
            setProgress(0);
            const r = await importClients(chosen, setProgress);
            setOutcome(r);
            Haptics.notificationAsync(
              r.failed ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
            );
            setPhase("done");
          },
        },
      ],
    );
  }, [chosen, importClients]);

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
            <UserPlus size={32} color={c.primary} />
            <Text style={[Type.h3, { color: c.text, textAlign: "center" }]}>Import your iPhone contacts</Text>
            <Text style={[Type.body, { color: c.textDim, textAlign: "center", lineHeight: 22 }]}>
              Agent Runway lists every contact that isn&apos;t already one of your {clients.length || ""} clients.
              You review the list before anything is added.
            </Text>
          </View>
          <View style={card}>
            {[
              "Anyone who shares a phone number, email or name with a client is skipped, including archived clients.",
              "Duplicates in your contacts are added once.",
              "Other real estate agents (a brokerage in their company, title, name or email) are listed separately and left unticked.",
              `New clients are filed as Cruising, lead source ${IMPORT_LEAD_SOURCE}, tagged "${IMPORT_TAG}", so you can find or remove them together.`,
              "Your contacts are read on this phone. Only the ones you import are saved.",
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
            <Button label="Read My Contacts" variant="primary" onPress={read} />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === "importing" || phase === "done") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
        <View style={{ padding: Space.xl, gap: Space.lg }}>
          <View style={[card, { alignItems: "center", gap: Space.md }]}>
            {phase === "importing" ? (
              <>
                <ActivityIndicator color={c.primary} />
                <Text style={[Type.body, { color: c.textMuted }]}>
                  Adding {progress} of {chosen.length}…
                </Text>
              </>
            ) : (
              <>
                <CheckCircle2 size={32} color={outcome?.failed ? c.warning : c.success} />
                <Text style={[Type.h3, { color: c.text, textAlign: "center" }]}>
                  Added {outcome?.added ?? 0} client{outcome?.added === 1 ? "" : "s"}
                </Text>
                {!!outcome?.skipped && (
                  <Text style={[Type.caption, { color: c.textDim, textAlign: "center" }]}>
                    {outcome.skipped} skipped: a client with that name already exists.
                  </Text>
                )}
                {!!outcome?.failed && (
                  <Text style={[Type.caption, { color: c.danger, textAlign: "center", lineHeight: 18 }]}>
                    {outcome.failed} couldn&apos;t be saved. Check your connection and run the import again; anyone already
                    added is skipped.
                  </Text>
                )}
                <Text style={[Type.caption, { color: c.textDim, textAlign: "center", lineHeight: 18 }]}>
                  Find them in Clients under Cruising, tagged &ldquo;{IMPORT_TAG}&rdquo;.
                </Text>
              </>
            )}
          </View>
          {phase === "done" && <Button label="Done" variant="primary" onPress={() => router.back()} />}
        </View>
      </SafeAreaView>
    );
  }

  // Review
  const skippedLine = [
    plan?.alreadyThere ? `${plan.alreadyThere} already in Agent Runway` : null,
    plan?.duplicates ? `${plan.duplicates} duplicate${plan.duplicates === 1 ? "" : "s"}` : null,
    plan?.noName ? `${plan.noName} with no name` : null,
  ].filter(Boolean).join(", ");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
      <SectionList
        sections={[
          { key: "people", title: null as string | null, data: people },
          ...(agents.length
            ? [{ key: "agents", title: `REAL ESTATE AGENTS (${agents.length}): NOT TICKED` as string | null, data: agents }]
            : []),
        ]}
        keyExtractor={(x) => x.contactId}
        initialNumToRender={30}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: Space.xl, gap: Space.sm, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: Space.sm, marginBottom: Space.sm }}>
            <Text style={[Type.label, { color: c.textMuted }]}>
              {candidates.length
                ? `${candidates.length} CONTACT${candidates.length === 1 ? "" : "S"} NOT IN AGENT RUNWAY`
                : "EVERYONE IS ALREADY HERE"}
            </Text>
            {!!skippedLine && (
              <Text style={[Type.caption, { color: c.textDim }]}>Skipping {skippedLine}.</Text>
            )}
            {people.length > 0 && (
              <Pressable
                onPress={() =>
                  setTicked((prev) => {
                    const next = new Set(prev);
                    for (const x of people) {
                      if (allTicked) next.delete(x.contactId);
                      else next.add(x.contactId);
                    }
                    return next;
                  })
                }
                accessibilityRole="button"
                style={{ alignSelf: "flex-start", paddingVertical: Space.xs }}
              >
                <Text style={[Type.bodyBold, { color: c.primary }]}>{allTicked ? "Untick all" : "Tick all"}</Text>
              </Pressable>
            )}
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View style={{ marginTop: Space.lg, gap: 2 }}>
              <Text style={[Type.label, { color: c.textMuted }]}>{section.title}</Text>
              <Text style={[Type.caption, { color: c.textDim }]}>
                Tick anyone here you do want as a client.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const on = ticked.has(item.contactId);
          return (
            <Pressable
              onPress={() => toggle(item.contactId)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: Space.md,
                padding: Space.md,
                borderRadius: Radius.md,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.cardBorder,
              }}
            >
              {on ? <CheckCircle2 size={20} color={c.primary} /> : <Circle size={20} color={c.textDim} />}
              <View style={{ flex: 1 }}>
                <Text style={[Type.bodyBold, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[Type.caption, { color: c.textDim }]} numberOfLines={1}>{detail(item)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
      {candidates.length > 0 && (
        <View style={{ position: "absolute", left: Space.xl, right: Space.xl, bottom: Space.xl }}>
          <Button
            label={chosen.length ? `Add ${chosen.length} client${chosen.length === 1 ? "" : "s"}` : "Nothing ticked"}
            variant="primary"
            disabled={chosen.length === 0}
            onPress={runImport}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
