import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import {
  Send,
  Pencil,
  SkipForward,
  Plane,
  X,
  Mail,
  User,
  Calendar,
  MessageSquare,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { textCheckOutcome } from "@agent-runway/core/lib/queued-text-check";
import * as SMS from "expo-sms";
import { useDataStore, type OutreachItem } from "@/stores/data-store";
import { supabase } from "@/lib/supabase";
import {
  useColors,
  useTheme,
  shadows,
  Space,
  Radius,
  Type,
} from "@/lib/theme";

// ── Config ─────────────────────────────────────────────────────────────────────

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://agentrunway.ca";

const OPPORTUNITY_LABELS: Record<string, string> = {
  birthday:        "Birthday",
  anniversary:     "Home Anniversary",
  re_engagement:   "Re-engagement",
  check_in:        "Check-in",
  holiday:         "Holiday",
  market_update:   "Market Update",
  listing_alert:   "Listing Alert",
  referral_ask:    "Referral Ask",
  just_sold:       "Just Sold",
  new_listing:     "New Listing",
  consent_lapsing: "Consent request",
};

function opportunityLabel(type: string): string {
  if (type === "text_message") return "Text";
  return OPPORTUNITY_LABELS[type] ?? type.replace(/_/g, " ");
}

/** The number a queued text goes to: the one it was drafted for, else the client's. */
function textPhone(item: OutreachItem): string | null {
  const drafted = item.context?.phone;
  return (typeof drafted === "string" && drafted.trim()) || item.clients?.phone?.trim() || null;
}

function fmtDate(d: string): string {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OutreachScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);

  const {
    outreachQueue,
    fetchOutreach,
    updateOutreachDraft,
    skipOutreach,
    markTexted,
  } = useDataStore();

  // Emails and texts (00179) share the queue; each tab shows one channel.
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<"emails" | "texts">(params.tab === "texts" ? "texts" : "emails");
  useEffect(() => {
    if (params.tab === "texts" || params.tab === "emails") setTab(params.tab);
  }, [params.tab]);
  const emails = outreachQueue.filter((i) => i.channel !== "sms");
  const texts = outreachQueue.filter((i) => i.channel === "sms");
  const shown = tab === "texts" ? texts : emails;

  const [refreshing, setRefreshing] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<OutreachItem | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  useEffect(() => {
    fetchOutreach();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOutreach();
    setRefreshing(false);
  }, [fetchOutreach]);

  // ── Send ─────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async (item: OutreachItem) => {
    const clientEmail = item.clients?.email;
    if (!clientEmail) {
      Alert.alert(
        "No Email Address",
        `${item.clients?.name ?? "This client"} doesn't have an email address on file. Add one in the CRM first.`
      );
      return;
    }

    const subject = item.final_subject || item.ai_subject || "Hello";
    const body = item.final_body || item.ai_body || "";

    Alert.alert(
      "Send Email",
      `Send "${subject}" to ${item.clients?.name ?? clientEmail}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          style: "default",
          onPress: async () => {
            setSendingId(item.id);
            try {
              const session = (await supabase.auth.getSession()).data.session;
              if (!session) {
                Alert.alert("Not Signed In", "Please sign in first.");
                return;
              }

              const res = await fetch(`${API_URL}/api/mobile/outreach/send`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ outreach_id: item.id }),
              });

              const json = await res.json();

              if (json.ok) {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success
                );
                useDataStore.setState({
                  outreachQueue: useDataStore
                    .getState()
                    .outreachQueue.filter((q) => q.id !== item.id),
                });
              } else if (json.code === "NO_CONSENT") {
                // CASL (consentStatus): unsubscribed, or implied consent
                // lapsed since this was drafted. The server says why.
                Alert.alert("Call instead", json.error ?? "Their consent doesn't cover this email any more.");
              } else if (json.code === "NO_CONNECTION") {
                Alert.alert(
                  "Email Sending Unavailable",
                  "Direct email sending from the app is not currently available."
                );
              } else if (json.code === "AUTH_EXPIRED") {
                Alert.alert(
                  "Email Sending Unavailable",
                  "Direct email sending from the app is not currently available."
                );
              } else {
                throw new Error(json.error ?? "Send failed");
              }
            } catch (err) {
              console.error("Send failed:", err);
              Alert.alert("Send Failed", "Please try again later.");
            } finally {
              setSendingId(null);
            }
          },
        },
      ]
    );
  }, []);

  // ── Send a text: iOS Messages opens prefilled; the agent taps Send ────────

  const handleSendText = useCallback(async (item: OutreachItem, bodyOverride?: string) => {
    const phone = textPhone(item);
    const name = item.clients?.name ?? "this client";
    if (!phone) {
      Alert.alert("No Phone Number", `${name} doesn't have a phone number on file. Add one in Clients first.`);
      return;
    }
    const body = bodyOverride ?? (item.final_body || item.ai_body || "");
    if (!(await SMS.isAvailableAsync())) {
      Alert.alert("Texting Unavailable", "This device can't send text messages.");
      return;
    }
    setSendingId(item.id);
    try {
      // CASL: the text was drafted earlier. Ask the server whether it may
      // still go out (unsubscribed, implied consent lapsed, archived) before
      // Messages opens. No answer means no text (fails closed).
      const session = (await supabase.auth.getSession()).data.session;
      let status: number | null = null;
      let answer: unknown = null;
      if (session) {
        try {
          const res = await fetch(`${API_URL}/api/mobile/outreach/text-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ outreach_id: item.id }),
          });
          status = res.status;
          answer = await res.json().catch(() => null);
        } catch {
          status = null;
        }
      }
      const check = textCheckOutcome(status, answer);
      if (!check.send) {
        if (check.removeFromQueue) {
          useDataStore.setState({
            outreachQueue: useDataStore.getState().outreachQueue.filter((q) => q.id !== item.id),
          });
        }
        Alert.alert(check.title, check.message);
        return;
      }

      const { result } = await SMS.sendSMSAsync([phone], body);
      const record = async () => {
        const ok = await markTexted(item.id, body);
        if (ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Alert.alert("Not Logged", `The text went out, but Agent Runway couldn't log it on ${name}'s history. Pull down to refresh and try again.`);
        }
      };
      if (result === "sent") {
        await record();
      } else if (result === "unknown") {
        Alert.alert("Did You Send It?", `Agent Runway couldn't tell whether the text to ${name} was sent.`, [
          { text: "Not Sent", style: "cancel" },
          { text: "Yes, Sent", onPress: () => void record() },
        ]);
      }
      // "cancelled": the agent closed Messages without sending; the text stays queued.
    } catch (err) {
      console.error("Text send failed:", err);
      Alert.alert("Couldn't Open Messages", "Please try again.");
    } finally {
      setSendingId(null);
    }
  }, [markTexted]);

  // ── Skip ─────────────────────────────────────────────────────────────────

  const handleSkip = useCallback(
    (item: OutreachItem) => {
      Alert.alert(
        "Skip This?",
        item.channel === "sms"
          ? `Skip the text to ${item.clients?.name ?? "this client"}?`
          : `Skip the ${opportunityLabel(item.opportunity_type).toLowerCase()} email to ${item.clients?.name ?? "this client"}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Skip",
            style: "destructive",
            onPress: async () => {
              await skipOutreach(item.id);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            },
          },
        ]
      );
    },
    [skipOutreach]
  );

  // ── Edit ─────────────────────────────────────────────────────────────────

  const openEdit = useCallback((item: OutreachItem) => {
    setEditItem(item);
    setEditSubject(item.final_subject || item.ai_subject || "");
    setEditBody(item.final_body || item.ai_body || "");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editItem) return;
    const ok = await updateOutreachDraft(editItem.id, editSubject, editBody);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setEditItem(null);
  }, [editItem, editSubject, editBody, updateOutreachDraft]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{ padding: Space.xl, gap: Space.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.primary}
          />
        }
      >
        {/* Emails | Texts */}
        <View
          style={{
            flexDirection: "row",
            padding: 3,
            borderRadius: Radius.lg,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.cardBorder,
          }}
        >
          {([
            { key: "emails", label: `Emails${emails.length ? ` (${emails.length})` : ""}`, Icon: Mail },
            { key: "texts", label: `Texts${texts.length ? ` (${texts.length})` : ""}`, Icon: MessageSquare },
          ] as const).map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: Space.sm + 2,
                  borderRadius: Radius.md,
                  backgroundColor: active ? c.primary : "transparent",
                }}
              >
                <Icon size={14} color={active ? "#FFF" : c.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#FFF" : c.textMuted }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Queue */}
        {shown.length === 0 ? (
          <View
            style={[{
              padding: Space.xxxl,
              borderRadius: Radius.xl,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.cardBorder,
              alignItems: "center",
              gap: Space.md,
            }, sh.card]}
          >
            <Plane size={32} color={c.textFaint} />
            <Text
              style={{
                ...Type.body,
                color: c.textDim,
                textAlign: "center",
                lineHeight: 22,
              }}
            >
              {tab === "texts"
                ? "No texts waiting.\nPick clients in Clients → Select → Text, or ask Flight Crew to draft texts."
                : "No outreach items right now.\nFlight Control scans your CRM and drafts emails when it finds opportunities."}
            </Text>
          </View>
        ) : (
          <View style={{ gap: Space.md }}>
            <Text style={{ ...Type.label, color: c.textMuted }}>
              {tab === "texts"
                ? `${shown.length} TEXT${shown.length !== 1 ? "S" : ""} TO SEND`
                : `${shown.length} ITEM${shown.length !== 1 ? "S" : ""} IN QUEUE`}
            </Text>
            {tab === "texts" && (
              <Text style={{ ...Type.caption, color: c.textDim, lineHeight: 18 }}>
                Tap Text to open Messages with the message filled in. Nothing goes out until you tap Send there.
              </Text>
            )}

            {shown.map((item) => (
              <OutreachCard
                key={item.id}
                item={item}
                sending={sendingId === item.id}
                onSend={() => (item.channel === "sms" ? handleSendText(item) : handleSend(item))}
                onEdit={() => openEdit(item)}
                onSkip={() => handleSkip(item)}
                c={c}
                sh={sh}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={editItem !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditItem(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: c.bg }}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ padding: Space.xl, gap: Space.lg }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Modal header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ ...Type.h2, color: c.text }}>
                  {editItem?.channel === "sms" ? "Edit Text" : "Edit Email"}
                </Text>
                <Pressable onPress={() => setEditItem(null)}>
                  <X size={24} color={c.textMuted} />
                </Pressable>
              </View>

              {/* Recipient */}
              {editItem && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Space.sm,
                    padding: Space.md,
                    borderRadius: Radius.md,
                    backgroundColor: c.card,
                    borderWidth: 1,
                    borderColor: c.cardBorder,
                  }}
                >
                  <User size={16} color={c.textDim} />
                  <Text style={{ ...Type.caption, color: c.textMuted }}>
                    To:{" "}
                    <Text style={{ color: c.text, fontWeight: "600" }}>
                      {editItem.clients?.name ?? "Unknown"}
                    </Text>
                    {editItem.clients?.email && (
                      <Text style={{ color: c.textDim }}>
                        {" "}
                        ({editItem.clients.email})
                      </Text>
                    )}
                  </Text>
                </View>
              )}

              {/* Subject (emails only) */}
              {editItem?.channel !== "sms" && (
              <View>
                <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>
                  SUBJECT
                </Text>
                <TextInput
                  value={editSubject}
                  onChangeText={setEditSubject}
                  placeholder="Email subject"
                  placeholderTextColor={c.textFaint}
                  style={{
                    ...Type.body,
                    color: c.text,
                    padding: Space.md + 2,
                    borderRadius: Radius.md,
                    backgroundColor: c.card,
                    borderWidth: 1,
                    borderColor: c.cardBorder,
                  }}
                />
              </View>
              )}

              {/* Body */}
              <View>
                <Text style={{ ...Type.label, color: c.textMuted, marginBottom: Space.sm }}>
                  MESSAGE
                </Text>
                <TextInput
                  value={editBody}
                  onChangeText={setEditBody}
                  placeholder="Email body"
                  placeholderTextColor={c.textFaint}
                  multiline
                  textAlignVertical="top"
                  style={{
                    ...Type.body,
                    color: c.text,
                    padding: Space.md + 2,
                    borderRadius: Radius.md,
                    backgroundColor: c.card,
                    borderWidth: 1,
                    borderColor: c.cardBorder,
                    minHeight: 200,
                  }}
                />
              </View>

              {/* Save buttons */}
              <View style={{ flexDirection: "row", gap: Space.md, marginTop: Space.sm }}>
                <Pressable
                  onPress={saveEdit}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: Space.sm,
                      paddingVertical: Space.lg,
                      borderRadius: Radius.lg,
                      backgroundColor: c.card,
                      borderWidth: 1,
                      borderColor: c.cardBorder,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Pencil size={16} color={c.textMuted} />
                  <Text style={{ ...Type.bodyBold, color: c.textMuted }}>
                    Save Draft
                  </Text>
                </Pressable>

                <Pressable
                  onPress={async () => {
                    if (!editItem) return;
                    await updateOutreachDraft(
                      editItem.id,
                      editSubject,
                      editBody
                    );
                    setEditItem(null);
                    if (editItem.channel === "sms") {
                      void handleSendText({ ...editItem, final_body: editBody }, editBody);
                    } else {
                      handleSend({
                        ...editItem,
                        final_subject: editSubject,
                        final_body: editBody,
                      });
                    }
                  }}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: Space.sm,
                      paddingVertical: Space.lg,
                      borderRadius: Radius.lg,
                      backgroundColor: c.primary,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Send size={16} color="#FFF" />
                  <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "700" }}>
                    Save & Send
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Outreach Card ─────────────────────────────────────────────────────────────

function OutreachCard({
  item,
  sending,
  onSend,
  onEdit,
  onSkip,
  c,
  sh,
}: {
  item: OutreachItem;
  sending: boolean;
  onSend: () => void;
  onEdit: () => void;
  onSkip: () => void;
  c: ReturnType<typeof useColors>;
  sh: ReturnType<typeof shadows>;
}) {
  const isText = item.channel === "sms";
  const subject = isText ? (textPhone(item) ?? "No phone number") : item.final_subject || item.ai_subject || "No subject";
  const body = item.final_body || item.ai_body || "";
  const preview = isText ? body : body.length > 100 ? body.slice(0, 100) + "..." : body;

  return (
    <View
      style={[{
        padding: Space.lg,
        borderRadius: Radius.xl,
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.cardBorder,
        gap: Space.md,
      }, sh.card]}
    >
      {/* Top row: client + type badge */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm, flex: 1 }}>
          <User size={16} color={c.primary} />
          <Text
            style={{ ...Type.bodyBold, color: c.text, flex: 1 }}
            numberOfLines={1}
          >
            {item.clients?.name ?? "Unknown Client"}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: Space.sm,
            paddingVertical: 3,
            borderRadius: Radius.sm,
            backgroundColor: c.primaryDim,
            borderWidth: 1,
            borderColor: c.primaryBorder,
          }}
        >
          <Text style={{ color: c.primaryLight, fontSize: 11, fontWeight: "600" }}>
            {opportunityLabel(item.opportunity_type)}
          </Text>
        </View>
      </View>

      {/* Subject line */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: Space.sm }}>
        {isText ? <MessageSquare size={14} color={c.textDim} /> : <Mail size={14} color={c.textDim} />}
        <Text
          style={{ ...Type.bodyBold, color: c.textSecondary, flex: 1 }}
          numberOfLines={1}
        >
          {subject}
        </Text>
      </View>

      {/* Body preview */}
      {preview && (
        <Text
          style={{ ...Type.caption, color: c.textDim, lineHeight: 18 }}
          numberOfLines={isText ? 8 : 2}
        >
          {preview}
        </Text>
      )}

      {/* Date */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: Space.xs }}>
        <Calendar size={12} color={c.textFaint} />
        <Text style={{ ...Type.micro, color: c.textFaint }}>
          {fmtDate(item.trigger_date)}
        </Text>
      </View>

      {/* Action buttons */}
      <View
        style={{
          flexDirection: "row",
          gap: Space.sm,
          borderTopWidth: 1,
          borderTopColor: c.cardBorder,
          paddingTop: Space.md,
        }}
      >
        <Pressable
          onPress={onSkip}
          style={({ pressed }) => [
            {
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: Radius.md,
              backgroundColor: c.divider,
            },
            pressed && { opacity: 0.6 },
          ]}
        >
          <SkipForward size={16} color={c.textDim} />
        </Pressable>

        <Pressable
          onPress={onEdit}
          style={({ pressed }) => [
            {
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 10,
              borderRadius: Radius.md,
              backgroundColor: c.primaryDim,
              borderWidth: 1,
              borderColor: c.primaryBorder,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Pencil size={14} color={c.primaryLight} />
          <Text style={{ color: c.primaryLight, fontSize: 13, fontWeight: "600" }}>
            Edit
          </Text>
        </Pressable>

        <Pressable
          onPress={onSend}
          disabled={sending}
          style={({ pressed }) => [
            {
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 10,
              borderRadius: Radius.md,
              backgroundColor: c.primary,
              opacity: sending ? 0.6 : 1,
            },
            pressed && !sending && { opacity: 0.85 },
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              {isText ? <MessageSquare size={14} color="#FFF" /> : <Send size={14} color="#FFF" />}
              <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "700" }}>
                {isText ? "Text" : "Send"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
