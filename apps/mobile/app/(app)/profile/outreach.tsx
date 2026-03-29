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
import {
  Send,
  Pencil,
  SkipForward,
  Plane,
  X,
  Mail,
  User,
  Calendar,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useDataStore, type OutreachItem } from "@/stores/data-store";
import { supabase } from "@/lib/supabase";

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
};

function opportunityLabel(type: string): string {
  return OPPORTUNITY_LABELS[type] ?? type.replace(/_/g, " ");
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
  const {
    outreachQueue,
    fetchOutreach,
    updateOutreachDraft,
    skipOutreach,
  } = useDataStore();

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
                // Remove from local queue
                useDataStore.setState({
                  outreachQueue: useDataStore
                    .getState()
                    .outreachQueue.filter((q) => q.id !== item.id),
                });
              } else if (json.code === "NO_CONNECTION") {
                Alert.alert(
                  "Gmail Not Connected",
                  "Connect your Gmail account in Settings on the web app to send emails directly."
                );
              } else if (json.code === "AUTH_EXPIRED") {
                Alert.alert(
                  "Gmail Reconnection Needed",
                  "Your Gmail connection has expired. Please reconnect in Settings on the web app."
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

  // ── Skip ─────────────────────────────────────────────────────────────────

  const handleSkip = useCallback(
    (item: OutreachItem) => {
      Alert.alert(
        "Skip This?",
        `Skip the ${opportunityLabel(item.opportunity_type).toLowerCase()} email to ${item.clients?.name ?? "this client"}?`,
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366F1"
          />
        }
      >
        {/* Header */}
        <View style={{ gap: 4 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: "800",
              color: "#FFFFFF",
              letterSpacing: -0.5,
            }}
          >
            Flight Control
          </Text>
          <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
            AI-drafted emails ready for your review
          </Text>
        </View>

        {/* Queue */}
        {outreachQueue.length === 0 ? (
          <View
            style={{
              padding: 40,
              borderRadius: 14,
              backgroundColor: "#1A1A2E",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Plane size={32} color="#4B5563" />
            <Text
              style={{
                color: "#6B7280",
                fontSize: 14,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              No outreach items right now.{"\n"}Flight Control scans your CRM
              and drafts emails when it finds opportunities.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Text
              style={{
                color: "#9CA3AF",
                fontSize: 12,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {outreachQueue.length} item
              {outreachQueue.length !== 1 ? "s" : ""} in queue
            </Text>

            {outreachQueue.map((item) => (
              <OutreachCard
                key={item.id}
                item={item}
                sending={sendingId === item.id}
                onSend={() => handleSend(item)}
                onEdit={() => openEdit(item)}
                onSkip={() => handleSkip(item)}
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
          style={{ flex: 1, backgroundColor: "#0A0A0F" }}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ padding: 20, gap: 16 }}
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
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "800",
                    color: "#FFF",
                  }}
                >
                  Edit Email
                </Text>
                <Pressable onPress={() => setEditItem(null)}>
                  <X size={24} color="#9CA3AF" />
                </Pressable>
              </View>

              {/* Recipient */}
              {editItem && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: "#1A1A2E",
                  }}
                >
                  <User size={16} color="#6B7280" />
                  <Text style={{ color: "#9CA3AF", fontSize: 13 }}>
                    To:{" "}
                    <Text style={{ color: "#FFF" }}>
                      {editItem.clients?.name ?? "Unknown"}
                    </Text>
                    {editItem.clients?.email && (
                      <Text style={{ color: "#6B7280" }}>
                        {" "}
                        ({editItem.clients.email})
                      </Text>
                    )}
                  </Text>
                </View>
              )}

              {/* Subject */}
              <View>
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: 12,
                    fontWeight: "600",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Subject
                </Text>
                <TextInput
                  value={editSubject}
                  onChangeText={setEditSubject}
                  placeholder="Email subject"
                  placeholderTextColor="#4B5563"
                  style={{
                    color: "#FFF",
                    fontSize: 15,
                    padding: 14,
                    borderRadius: 10,
                    backgroundColor: "#1A1A2E",
                    borderWidth: 1,
                    borderColor: "#2D2D44",
                  }}
                />
              </View>

              {/* Body */}
              <View>
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: 12,
                    fontWeight: "600",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Message
                </Text>
                <TextInput
                  value={editBody}
                  onChangeText={setEditBody}
                  placeholder="Email body"
                  placeholderTextColor="#4B5563"
                  multiline
                  textAlignVertical="top"
                  style={{
                    color: "#FFF",
                    fontSize: 15,
                    padding: 14,
                    borderRadius: 10,
                    backgroundColor: "#1A1A2E",
                    borderWidth: 1,
                    borderColor: "#2D2D44",
                    minHeight: 200,
                  }}
                />
              </View>

              {/* Save buttons */}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <Pressable
                  onPress={saveEdit}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingVertical: 16,
                    borderRadius: 12,
                    backgroundColor: "#1A1A2E",
                    borderWidth: 1,
                    borderColor: "#2D2D44",
                  }}
                >
                  <Pencil size={16} color="#9CA3AF" />
                  <Text
                    style={{
                      color: "#9CA3AF",
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
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
                    handleSend({
                      ...editItem,
                      final_subject: editSubject,
                      final_body: editBody,
                    });
                  }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingVertical: 16,
                    borderRadius: 12,
                    backgroundColor: "#6366F1",
                  }}
                >
                  <Send size={16} color="#FFF" />
                  <Text
                    style={{
                      color: "#FFF",
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
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
}: {
  item: OutreachItem;
  sending: boolean;
  onSend: () => void;
  onEdit: () => void;
  onSkip: () => void;
}) {
  const subject = item.final_subject || item.ai_subject || "No subject";
  const body = item.final_body || item.ai_body || "";
  const preview = body.length > 100 ? body.slice(0, 100) + "..." : body;

  return (
    <View
      style={{
        padding: 16,
        borderRadius: 12,
        backgroundColor: "#1A1A2E",
        borderWidth: 1,
        borderColor: "#2D2D44",
        gap: 12,
      }}
    >
      {/* Top row: client + type badge */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <User size={16} color="#6366F1" />
          <Text
            style={{
              color: "#FFF",
              fontSize: 15,
              fontWeight: "700",
              flex: 1,
            }}
            numberOfLines={1}
          >
            {item.clients?.name ?? "Unknown Client"}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: "rgba(99,102,241,0.1)",
          }}
        >
          <Text
            style={{
              color: "#818CF8",
              fontSize: 11,
              fontWeight: "600",
            }}
          >
            {opportunityLabel(item.opportunity_type)}
          </Text>
        </View>
      </View>

      {/* Subject line */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Mail size={14} color="#6B7280" />
        <Text
          style={{ color: "#E5E7EB", fontSize: 14, fontWeight: "600", flex: 1 }}
          numberOfLines={1}
        >
          {subject}
        </Text>
      </View>

      {/* Body preview */}
      {preview && (
        <Text
          style={{
            color: "#6B7280",
            fontSize: 13,
            lineHeight: 18,
          }}
          numberOfLines={2}
        >
          {preview}
        </Text>
      )}

      {/* Date */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Calendar size={12} color="#4B5563" />
        <Text style={{ color: "#4B5563", fontSize: 12 }}>
          {fmtDate(item.trigger_date)}
        </Text>
      </View>

      {/* Action buttons */}
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: "#2D2D44",
          paddingTop: 12,
        }}
      >
        <Pressable
          onPress={onSkip}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 8,
            backgroundColor: "rgba(107,114,128,0.1)",
          }}
        >
          <SkipForward size={16} color="#6B7280" />
        </Pressable>

        <Pressable
          onPress={onEdit}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: "rgba(99,102,241,0.1)",
          }}
        >
          <Pencil size={14} color="#818CF8" />
          <Text
            style={{
              color: "#818CF8",
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            Edit
          </Text>
        </Pressable>

        <Pressable
          onPress={onSend}
          disabled={sending}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: "#6366F1",
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Send size={14} color="#FFF" />
              <Text
                style={{
                  color: "#FFF",
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                Send
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
