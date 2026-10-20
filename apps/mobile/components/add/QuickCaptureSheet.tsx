/**
 * Log a call, text, showing, meeting or note against a client: the "+"
 * sheet's first action (components/add/AddSheet.tsx). Moved from the
 * dashboard on 2026-10-20, unchanged.
 */
import { useMemo, useRef, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useDataStore, type Client } from "@/stores/data-store";
import { useColors, Space, Radius, Type } from "@/lib/theme";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";

// ── Activity Type Pill Selector ─────────────────────────────────────────────

const ACTIVITY_TYPES = ["call", "text", "showing", "meeting", "note"] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

function ActivityTypePicker({
  selected,
  onSelect,
  colors: c,
  labels,
}: {
  selected: ActivityType;
  onSelect: (t: ActivityType) => void;
  colors: ReturnType<typeof useColors>;
  labels?: Record<string, string>;
}) {
  return (
    <View style={{ flexDirection: "row", gap: Space.sm, flexWrap: "wrap" }}>
      {ACTIVITY_TYPES.map((type) => {
        const active = type === selected;
        return (
          <Pressable
            key={type}
            onPress={() => onSelect(type)}
            style={{
              paddingHorizontal: Space.md,
              paddingVertical: Space.sm,
              borderRadius: Radius.pill,
              backgroundColor: active ? c.primary : c.primaryDim,
              borderWidth: 1,
              borderColor: active ? c.primary : c.primaryBorder,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: active ? "#FFFFFF" : c.primary,
              }}
            >
              {labels?.[type] ?? type}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Quick Capture Sheet ─────────────────────────────────────────────────────

export function QuickCaptureSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation("home");
  const { t: tCommon } = useTranslation("common");
  const { clients, addActivity } = useDataStore();
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activityType, setActivityType] = useState<ActivityType>("note");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const notesRef = useRef<TextInput>(null);

  const filteredClients = useMemo(() => {
    if (!clientQuery.trim() || selectedClient) return [];
    const q = clientQuery.toLowerCase().trim();
    return clients
      .filter((cl) => cl.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [clientQuery, clients, selectedClient]);

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setClientQuery(client.name);
    setTimeout(() => notesRef.current?.focus(), 100);
  };

  const handleSave = async () => {
    if (!selectedClient || !notes.trim()) return;
    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    await addActivity({
      client_id: selectedClient.id,
      type: activityType,
      description: notes.trim(),
      activity_date: new Date().toISOString(),
    });
    setSaving(false);
    setClientQuery("");
    setSelectedClient(null);
    setActivityType("note");
    setNotes("");
    onClose();
  };

  const handleClose = () => {
    setClientQuery("");
    setSelectedClient(null);
    setActivityType("note");
    setNotes("");
    onClose();
  };

  const canSave = selectedClient && notes.trim().length > 0 && !saving;

  return (
    <Sheet visible={visible} onClose={handleClose} title={t("quickCapture.title")}>
      <View style={{ gap: Space.lg, paddingBottom: Space.lg }}>
        <View>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>{t("quickCapture.clientLabel")}</Text>
          <TextInput
            value={clientQuery}
            onChangeText={(text) => {
              setClientQuery(text);
              if (selectedClient) setSelectedClient(null);
            }}
            placeholder={t("quickCapture.searchClient")}
            placeholderTextColor={c.textDim}
            style={{
              backgroundColor: c.card,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: c.cardBorder,
              paddingHorizontal: Space.md,
              paddingVertical: Space.md,
              ...Type.body,
              color: c.text,
            }}
            autoCorrect={false}
          />
          {filteredClients.length > 0 && (
            <View
              style={{
                backgroundColor: c.card,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: c.cardHighBorder,
                marginTop: Space.xs,
                overflow: "hidden",
              }}
            >
              {filteredClients.map((client, idx) => (
                <Pressable
                  key={client.id}
                  onPress={() => handleSelectClient(client)}
                  style={({ pressed }) => [
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: Space.md,
                      paddingVertical: Space.sm,
                      gap: Space.md,
                      borderTopWidth: idx > 0 ? 1 : 0,
                      borderTopColor: c.divider,
                    },
                    pressed && { backgroundColor: c.primaryDim },
                  ]}
                >
                  <Avatar name={client.name} size="sm" />
                  <Text style={{ ...Type.bodyBold, color: c.text, flex: 1 }} numberOfLines={1}>
                    {client.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>{t("quickCapture.typeLabel")}</Text>
          <ActivityTypePicker selected={activityType} onSelect={setActivityType} colors={c} labels={{
            call: t("quickCapture.activityTypes.call"),
            text: t("quickCapture.activityTypes.text"),
            showing: t("quickCapture.activityTypes.showing"),
            meeting: t("quickCapture.activityTypes.meeting"),
            note: t("quickCapture.activityTypes.note"),
          }} />
          {activityType === "note" && (
            <Text style={{ ...Type.caption, color: c.textMuted, marginTop: Space.xs }}>
              {t("quickCapture.noteNotContact")}
            </Text>
          )}
        </View>

        <View>
          <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>{t("quickCapture.notesLabel")}</Text>
          <TextInput
            ref={notesRef}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("quickCapture.notesPlaceholder")}
            placeholderTextColor={c.textDim}
            multiline
            textAlignVertical="top"
            style={{
              backgroundColor: c.card,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: c.cardBorder,
              paddingHorizontal: Space.md,
              paddingVertical: Space.md,
              ...Type.body,
              color: c.text,
              minHeight: 80,
            }}
          />
        </View>

        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          style={({ pressed }) => [
            {
              backgroundColor: canSave ? c.primary : c.primaryDim,
              borderRadius: Radius.md,
              paddingVertical: Space.md,
              alignItems: "center",
              justifyContent: "center",
            },
            pressed && canSave && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={{ color: canSave ? "#FFFFFF" : c.textDim, fontSize: 15, fontWeight: "700" }}>
            {saving ? tCommon("actions.saving") : tCommon("actions.save")}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
