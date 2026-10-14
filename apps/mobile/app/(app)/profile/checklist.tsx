/**
 * Checklist — the open contact_tasks items, the same list as web's
 * /checklist, the client profile and Flight Crew.
 *
 * Mobile scope is "respond": tick an item off. A client item opens the
 * tick-off sheet (Save to their profile / Couldn't reach them / Just mark
 * done); a general item is done in one tap and can be undone here. Adding,
 * editing and deleting items stays on web. Grouping and day labels are core
 * helpers (core/lib/checklist), so the phone and web agree on what is
 * overdue.
 */

import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { groupOpenItems, dueLabel, overdueLabel } from "@agent-runway/core/lib/checklist";
import { localISODate } from "@agent-runway/core/lib/local-date";
import { useDataStore, type ContactTask } from "@/stores/data-store";
import { CompleteTaskSheet } from "@/components/CompleteTaskSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { useColors, Space, Radius, Type } from "@/lib/theme";

export default function ChecklistScreen() {
  const c = useColors();
  const { t } = useTranslation("profile");
  const { tasks, clients, fetchAll, markTaskDone, reopenTask } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [ticking, setTicking] = useState<ContactTask | null>(null);
  // General items ticked off on this screen, so they can be undone.
  const [justDone, setJustDone] = useState<ContactTask[]>([]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, []),
  );

  const today = localISODate();
  const groups = useMemo(() => groupOpenItems(tasks, today), [tasks, today]);
  const clientName = useCallback(
    (id: string | null) => (id ? clients.find((cl) => cl.id === id)?.name ?? "" : ""),
    [clients],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const tick = async (task: ContactTask) => {
    if (task.client_id) {
      setTicking(task);
      return;
    }
    if (await markTaskDone(task)) setJustDone((d) => [task, ...d]);
  };

  const undo = async (task: ContactTask) => {
    if (await reopenTask(task)) setJustDone((d) => d.filter((x) => x.id !== task.id));
  };

  const sections: { key: keyof typeof groups; title: string; color: string }[] = [
    { key: "overdue", title: t("checklist.overdue"), color: c.danger },
    { key: "today", title: t("checklist.today"), color: c.primary },
    { key: "upcoming", title: t("checklist.upcoming"), color: c.textMuted },
  ];
  const openCount = groups.overdue.length + groups.today.length + groups.upcoming.length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: Space.xl, paddingBottom: 120, gap: Space.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      {openCount === 0 && justDone.length === 0 && (
        <EmptyState
          icon="checkmark-done-outline"
          title={t("checklist.emptyTitle")}
          subtitle={t("checklist.emptySubtitle")}
        />
      )}

      {sections.map(({ key, title, color }) => {
        const items = groups[key];
        if (items.length === 0) return null;
        return (
          <View key={key} style={{ gap: Space.sm }}>
            <Text style={[Type.label, { color }]}>{`${title} · ${items.length}`}</Text>
            {items.map((task) => {
              const name = clientName(task.client_id);
              const due = task.due_date < today ? overdueLabel(task.due_date, today) : dueLabel(task.due_date, today);
              return (
                <Pressable
                  key={task.id}
                  onPress={() => tick(task)}
                  accessibilityRole="button"
                  accessibilityLabel={`${task.title}. ${t("checklist.tickOff")}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Space.md,
                    padding: Space.lg,
                    borderRadius: Radius.lg,
                    borderWidth: 1,
                    borderColor: c.cardBorder,
                    backgroundColor: c.card,
                  }}
                >
                  <Ionicons name="ellipse-outline" size={24} color={key === "overdue" ? c.danger : c.textDim} />
                  <View style={{ flex: 1 }}>
                    <Text style={[Type.bodyBold, { color: c.text }]} numberOfLines={2}>
                      {task.title}
                    </Text>
                    <Text style={[Type.caption, { color: key === "overdue" ? c.danger : c.textDim, marginTop: 2 }]}>
                      {name ? `${name} · ${due}` : due}
                      {task.priority === "high" ? ` · ${t("checklist.highPriority")}` : ""}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {justDone.length > 0 && (
        <View style={{ gap: Space.sm }}>
          <Text style={[Type.label, { color: c.success }]}>{t("checklist.justDoneTitle")}</Text>
          {justDone.map((task) => (
            <View
              key={task.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: Space.md,
                padding: Space.lg,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: c.cardBorder,
                backgroundColor: c.card,
              }}
            >
              <Ionicons name="checkmark-circle" size={24} color={c.success} />
              <Text style={[Type.body, { flex: 1, color: c.textDim, textDecorationLine: "line-through" }]} numberOfLines={2}>
                {task.title}
              </Text>
              <Pressable onPress={() => undo(task)} hitSlop={Space.sm}>
                <Text style={[Type.caption, { color: c.primary, fontWeight: "700" }]}>{t("checklist.undo")}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <CompleteTaskSheet
        task={ticking}
        clientName={clientName(ticking?.client_id ?? null)}
        onClose={() => setTicking(null)}
      />
    </ScrollView>
  );
}
