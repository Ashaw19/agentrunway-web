/**
 * AI activity — what Flight Crew changed in the agent's records today, with
 * Undo as the respond action. The web page (Settings → AI activity) has the
 * last 30 days and the AI calls; the phone is for glance and respond.
 *
 * The list reads the AI run ledger (ai_run_writes, migration 00182) with the
 * phone's signed-in client (RLS: own rows) through the same core loader and
 * wording as the web. Undo calls the web's /api/ai-activity/undo, which runs
 * core ai-undo.ts with the agent's own client and refuses, with the reason,
 * when a record changed since.
 */

import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import {
  actionView,
  aiActivitySince,
  formatAiActivityTime,
  loadAIActivity,
  type AIActionView,
} from "@agent-runway/core/lib/ai-activity-load";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { EmptyState } from "@/components/ui/EmptyState";
import { useColors, Space, Radius, Type } from "@/lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";

export default function AiActivityScreen() {
  const c = useColors();
  const { t } = useTranslation("profile");
  const { user } = useAuth();
  const [actions, setActions] = useState<AIActionView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const now = new Date();
      const snap = await loadAIActivity(supabase, user.id, { since: aiActivitySince("today", now), includeRuns: false, writeLimit: 200 });
      setActions(snap.actions.map((a) => actionView(a, now)));
      setLoadFailed(snap.error !== null);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoaded(true);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const runUndo = async (action: AIActionView) => {
    setUndoing(action.toolCallId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        Alert.alert(t("aiActivity.undoFailedTitle"), t("aiActivity.signedOut"));
        return;
      }
      const res = await fetch(`${API_URL}/api/ai-activity/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        // The fingerprint of what this list showed: the undo refuses if the
        // change moved on since.
        body: JSON.stringify({ toolCallId: action.toolCallId, expected: action.fingerprint }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (res.ok && body?.ok) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
        await load();
      } else {
        Alert.alert(t("aiActivity.undoFailedTitle"), body?.message ?? t("aiActivity.networkError"));
      }
    } catch {
      Alert.alert(t("aiActivity.undoFailedTitle"), t("aiActivity.networkError"));
    } finally {
      setUndoing(null);
    }
  };

  const confirmUndo = (action: AIActionView) => {
    const what = action.consequences.map((c) => `• ${c}`).join("\n");
    const warning = action.deletesClient ? t("aiActivity.deletesClientWarning") : t("aiActivity.allOrNothing");
    Alert.alert(t("aiActivity.confirmTitle"), [action.label, what, warning].filter(Boolean).join("\n\n"), [
      { text: t("aiActivity.cancel"), style: "cancel" },
      {
        text: action.deletesClient ? t("aiActivity.deleteClient") : t("aiActivity.undo"),
        style: "destructive",
        onPress: () => runUndo(action),
      },
    ]);
  };

  const sourceLabel = (s: AIActionView["source"]) =>
    s === "approval" ? t("aiActivity.afterApproval") : s === "chat" ? t("aiActivity.inChat") : "";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: Space.xl, paddingBottom: 120, gap: Space.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      {loadFailed && (
        <Text style={[Type.caption, { color: c.danger }]}>{t("aiActivity.loadError")}</Text>
      )}

      {loaded && actions.length === 0 && !loadFailed && (
        <EmptyState icon="sparkles-outline" title={t("aiActivity.emptyTitle")} subtitle={t("aiActivity.emptySubtitle")} />
      )}

      {actions.length > 0 && (
        <Text style={[Type.label, { color: c.textMuted }]}>{`${t("aiActivity.today")} · ${actions.length}`}</Text>
      )}

      {actions.map((a) => {
        const source = sourceLabel(a.source);
        return (
          <View
            key={a.toolCallId}
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
            <Ionicons
              name={a.undone ? "arrow-undo-circle-outline" : a.failed && !a.canUndo ? "alert-circle-outline" : "checkmark-circle-outline"}
              size={24}
              color={a.undone ? c.textDim : a.failed && !a.canUndo ? c.danger : c.success}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[Type.bodyBold, { color: a.undone ? c.textDim : c.text, textDecorationLine: a.undone ? "line-through" : "none" }]}
                numberOfLines={2}
              >
                {a.label}
              </Text>
              <Text style={[Type.caption, { color: c.textDim, marginTop: 2 }]} numberOfLines={3}>
                {[formatAiActivityTime(a.createdAt), source, a.status].filter(Boolean).join(" · ")}
              </Text>
            </View>
            {a.canUndo && (
              <Pressable
                onPress={() => confirmUndo(a)}
                disabled={undoing !== null}
                hitSlop={Space.sm}
                accessibilityRole="button"
                accessibilityLabel={`${t("aiActivity.undo")}: ${a.label}`}
              >
                {undoing === a.toolCallId ? (
                  <ActivityIndicator size="small" color={c.primary} />
                ) : (
                  <Text style={[Type.caption, { color: c.primary, fontWeight: "700" }]}>{t("aiActivity.undo")}</Text>
                )}
              </Pressable>
            )}
          </View>
        );
      })}

      <Text style={[Type.caption, { color: c.textDim, marginTop: Space.md }]}>{t("aiActivity.footnote")}</Text>
    </ScrollView>
  );
}
