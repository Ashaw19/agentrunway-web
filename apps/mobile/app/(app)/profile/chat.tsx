/**
 * apps/mobile/app/(app)/profile/chat.tsx
 *
 * Flight Crew chat surface — mobile Phase A.
 *
 * Single conversation, three personas (Captain default, Navigator,
 * Dispatcher). Streams responses from `/api/chat` via XHR, parses the
 * Vercel AI SDK data-stream protocol, auto-routes narrated handoffs the
 * same way the web client does, and persists history to MMKV.
 *
 * Out of scope for Phase A (gates documented in the parity audit):
 *   - Voice I/O — requires Apple Developer Program unblock + Law 25 review
 *   - Tool-approval UI — surfaces an inline "open the web app to approve"
 *     notice when an approval-required event arrives
 *   - Inline persona @-autocomplete dropdown — @mentions still work as
 *     plain text (parsed by `parseMention`), but no inline picker
 *
 * See:
 *   - memory/project_mobile_parity_audit_2026-05-26.md gap #1
 *   - memory/project_flight_crew_direction.md (8 locked decisions)
 *   - memory/project_flight_crew_ui_design.md (web visual baseline)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Send, Square, Trash2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useColors, Radius, Space, Type, useTheme, shadows } from "@/lib/theme";
import { useOfflineQueueStore } from "@/stores/offline-queue";
import { useChatStore, nextMessageId, type ChatMessage } from "@/stores/chat-store";
import {
  CREW_PERSONAS,
  DEFAULT_PERSONA,
  detectHandoff,
  getPersona,
  parseMention,
  type Persona,
} from "@/lib/flight-crew/personas";
import { ChatError, streamChat, type WireMessage } from "@/lib/flight-crew/chat-client";
import { MessageBubble } from "@/components/flight-crew/MessageBubble";
import { HandoffSeam } from "@/components/flight-crew/HandoffSeam";
import { PersonaSelector, PersonaChip } from "@/components/flight-crew/PersonaSelector";
import { useToastStore } from "@/stores/toast-store";

const GREETING_BY_PERSONA: Record<Persona, string> = {
  captain:
    "I'm the Captain — strategic overview and orchestration. Ask me anything, or @mention Navigator for finance/tax or Dispatcher for clients/pipeline.",
  navigator:
    "Navigator here. I cover finance, tax, runway and CRA-side questions. Information only — never advice.",
  dispatcher:
    "Dispatcher here. Clients, pipeline, follow-ups — what do you need?",
};

export default function ChatScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const isDark = mode === "dark";

  const { isOnline } = useOfflineQueueStore();
  const showToast = useToastStore((s) => s.show);
  const {
    messages,
    activePersona,
    isStreaming,
    appendMessage,
    updateMessage,
    setActivePersona,
    setStreaming,
    clear,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Auto-scroll on new message or content update.
  useEffect(() => {
    if (messages.length === 0) return;
    // Defer to next tick so FlatList has measured.
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToEnd({ animated: true });
      } catch {
        /* list not mounted */
      }
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length, messages[messages.length - 1]?.content]);

  // Cancel any in-flight stream when the screen unmounts.
  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const buildWireMessages = useCallback((): WireMessage[] => {
    // Serialize the same way web does — role + plain content. We intentionally
    // do NOT send messages flagged as `pending` (the empty placeholder waiting
    // to be streamed into); see ai-chat.tsx for the same pattern.
    return messages
      .filter((m) => !m.pending && m.content)
      .map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  const sendOneTurn = useCallback(
    async (
      wireHistory: WireMessage[],
      targetPersona: Persona,
      placeholderId: string,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const finalText = await streamChat(
          {
            messages: wireHistory,
            persona: targetPersona,
            currentPage: "/mobile/chat",
            signal: controller.signal,
          },
          {
            onText: (full) => {
              updateMessage(placeholderId, { content: full });
            },
            onApprovalRequired: (toolName, description) => {
              updateMessage(placeholderId, {
                approvalDeferred: { toolName, description },
              });
            },
          },
        );
        updateMessage(placeholderId, { pending: false, content: finalText });
        return finalText;
      } catch (err) {
        if (err instanceof ChatError) {
          updateMessage(placeholderId, {
            pending: false,
            content: chatErrorMessage(err),
          });
        } else {
          updateMessage(placeholderId, {
            pending: false,
            content: "Something went wrong — please try again.",
          });
        }
        throw err;
      } finally {
        abortRef.current = null;
      }
    },
    [updateMessage],
  );

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    if (!isOnline) {
      showToast("Chat is online-only — try again when connected.", "info");
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    // @mention overrides activePersona for this single turn only — matches web.
    const mentioned = parseMention(trimmed);
    const effectivePersona: Persona = mentioned ?? activePersona;

    // Append the user message + an empty assistant placeholder.
    const userMsg: ChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const placeholderId = nextMessageId();
    const placeholder: ChatMessage = {
      id: placeholderId,
      role: "assistant",
      content: "",
      persona: effectivePersona,
      createdAt: Date.now(),
      pending: true,
    };
    appendMessage(userMsg);
    appendMessage(placeholder);
    setInput("");

    // Build wire history INCLUDING the just-appended user message.
    const wireHistory: WireMessage[] = [
      ...buildWireMessages(),
      { role: "user", content: trimmed },
    ];

    setStreaming(true);
    try {
      const assistantText = await sendOneTurn(
        wireHistory,
        effectivePersona,
        placeholderId,
      );

      // ── Handoff auto-routing ─────────────────────────────────────────
      // Detect narrated handoffs the same way the web client does. On
      // detection, truncate the speaker bubble to the handoff sentence,
      // insert a seam placeholder, then fire a second /api/chat call
      // for the target persona.
      const handoff = detectHandoff(assistantText, effectivePersona);
      if (handoff && !assistantText.startsWith("Sorry")) {
        const { target, displayText } = handoff;
        // Truncate speaker bubble.
        updateMessage(placeholderId, { content: displayText });

        // Insert seam placeholder.
        const seamId = nextMessageId();
        appendMessage({
          id: seamId,
          role: "assistant",
          content: "",
          persona: target,
          createdAt: Date.now(),
          pending: true,
          handoffTo: target,
        });

        // Build the follow-up history: existing wire + the truncated
        // handoff bubble (so the target persona sees it).
        const followUpHistory: WireMessage[] = [
          ...wireHistory,
          { role: "assistant", content: displayText },
        ];
        await sendOneTurn(followUpHistory, target, seamId);
      }
    } catch (err) {
      // sendOneTurn already wrote the error into the placeholder; just log.
      if (err instanceof ChatError && err.code !== "aborted") {
        showToast(chatErrorMessage(err), "error");
      }
    } finally {
      setStreaming(false);
    }
  }, [
    input,
    isStreaming,
    isOnline,
    activePersona,
    appendMessage,
    buildWireMessages,
    sendOneTurn,
    updateMessage,
    setStreaming,
    showToast,
  ]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, [setStreaming]);

  const handleClear = useCallback(() => {
    Alert.alert(
      "Clear conversation?",
      "This removes the message history on this device. The Flight Crew's memory of past conversations on the web is unaffected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            clear();
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {}
          },
        },
      ],
    );
  }, [clear]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      // Handoff seam rows render the seam ABOVE an empty target-persona
      // bubble so the seam appears between speaker and target.
      if (item.handoffTo && item.content.length === 0 && item.pending) {
        return (
          <View>
            <HandoffSeam target={item.handoffTo} />
            <MessageBubble
              role="assistant"
              content=""
              persona={item.handoffTo}
              pending
            />
          </View>
        );
      }
      if (item.handoffTo && item.content.length > 0) {
        return (
          <View>
            <HandoffSeam target={item.handoffTo} />
            <MessageBubble
              role="assistant"
              content={item.content}
              persona={item.handoffTo}
              pending={item.pending}
              approvalDeferred={item.approvalDeferred}
            />
          </View>
        );
      }
      return (
        <MessageBubble
          role={item.role}
          content={item.content}
          persona={item.persona}
          pending={item.pending}
          approvalDeferred={item.approvalDeferred}
        />
      );
    },
    [],
  );

  const greetingPersona = getPersona(activePersona);
  const GreetingIcon = greetingPersona.icon;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Header bar — persona chip + clear */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: Space.lg,
            paddingVertical: Space.sm,
            borderBottomWidth: 1,
            borderBottomColor: c.cardBorder,
            backgroundColor: c.bg,
          }}
        >
          <PersonaChip
            persona={activePersona}
            onPress={() => setSelectorOpen(true)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear conversation"
            onPress={handleClear}
            hitSlop={8}
            style={({ pressed }) => ({
              padding: 6,
              borderRadius: Radius.md,
              backgroundColor: pressed ? c.bgElevated : "transparent",
            })}
          >
            <Trash2 size={18} color={c.textMuted} strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* Message list */}
        {messages.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: Space.xl,
            }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: greetingPersona.accentTint,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: Space.lg,
              }}
            >
              <GreetingIcon
                size={32}
                color={greetingPersona.accent}
                strokeWidth={2}
              />
            </View>
            <Text
              style={{
                ...Type.h2,
                color: c.text,
                marginBottom: Space.sm,
                textAlign: "center",
              }}
            >
              Flight Crew
            </Text>
            <Text
              style={{
                ...Type.body,
                color: c.textMuted,
                textAlign: "center",
                lineHeight: 22,
              }}
            >
              {GREETING_BY_PERSONA[activePersona]}
            </Text>
            <View
              style={{
                flexDirection: "row",
                gap: Space.sm,
                marginTop: Space.xl,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {CREW_PERSONAS.map((meta) => {
                const Icon = meta.icon;
                return (
                  <View
                    key={meta.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: meta.accentTint,
                    }}
                  >
                    <Icon size={12} color={meta.accent} strokeWidth={2.25} />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: meta.accentText,
                      }}
                    >
                      @{meta.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingHorizontal: Space.lg,
              paddingTop: Space.lg,
              paddingBottom: Space.md,
            }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              try {
                listRef.current?.scrollToEnd({ animated: false });
              } catch {}
            }}
          />
        )}

        {/* Offline banner */}
        {!isOnline && (
          <View
            style={{
              marginHorizontal: Space.lg,
              marginBottom: Space.sm,
              paddingHorizontal: Space.md,
              paddingVertical: Space.sm,
              backgroundColor: c.warningDim,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: c.warning,
            }}
          >
            <Text style={{ ...Type.caption, color: c.text, fontWeight: "600" }}>
              You're offline
            </Text>
            <Text style={{ ...Type.caption, color: c.textSecondary, marginTop: 2 }}>
              Chat is online-only — try again when connected.
            </Text>
          </View>
        )}

        {/* Composer */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: Space.sm,
            paddingHorizontal: Space.lg,
            paddingVertical: Space.sm,
            borderTopWidth: 1,
            borderTopColor: c.cardBorder,
            backgroundColor: c.bg,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: c.card,
              borderRadius: Radius.xl,
              borderWidth: 1,
              borderColor: c.cardBorder,
              paddingHorizontal: Space.md,
              paddingVertical: Space.sm,
              minHeight: 44,
              maxHeight: 140,
            }}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={`Message ${getPersona(activePersona).name}…`}
              placeholderTextColor={c.textDim}
              multiline
              editable={!isStreaming}
              style={{
                ...Type.body,
                color: c.text,
                textAlignVertical: "top",
                padding: 0,
                minHeight: 28,
                maxHeight: 120,
              }}
              accessibilityLabel={`Message ${getPersona(activePersona).name}`}
            />
          </View>
          {isStreaming ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop"
              onPress={handleStop}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.danger,
                opacity: pressed ? 0.85 : 1,
                ...sh.card,
              })}
            >
              <Square size={18} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={input.trim().length === 0}
              onPress={handleSend}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  input.trim().length === 0
                    ? isDark ? "#2A2A4A" : "#E5E7EB"
                    : getPersona(activePersona).accent,
                opacity: pressed ? 0.85 : 1,
                ...sh.card,
              })}
            >
              <Send size={18} color="#FFFFFF" strokeWidth={2.5} />
            </Pressable>
          )}
        </View>

        {/* Streaming indicator (subtle, below composer) */}
        {isStreaming && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: Space.lg,
              paddingBottom: Space.xs,
            }}
          >
            <ActivityIndicator
              size="small"
              color={getPersona(activePersona).accent}
            />
            <Text style={{ ...Type.micro, color: c.textMuted }}>
              {getPersona(activePersona).name.toUpperCase()} STREAMING…
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <PersonaSelector
        visible={selectorOpen}
        active={activePersona}
        onSelect={(p) => {
          setActivePersona(p);
          try {
            Haptics.selectionAsync();
          } catch {}
        }}
        onClose={() => setSelectorOpen(false)}
      />
    </SafeAreaView>
  );
}

function chatErrorMessage(err: ChatError): string {
  switch (err.code) {
    case "offline":
      return "Chat is online-only — try again when connected.";
    case "unauthorized":
      return "Your session expired — please sign in again.";
    case "rate_limited":
      return "You've sent a lot of messages — wait a moment and try again.";
    case "aborted":
      return "Stopped.";
    case "network_error":
      return "Couldn't reach the Flight Crew. Check your connection.";
    default:
      return "The Flight Crew is unavailable right now — please try again.";
  }
}

// Silence the unused-import warning in environments where DEFAULT_PERSONA
// is only consumed indirectly via the store's fallback. Keep the import
// so future contributors see the canonical default in the import list.
void DEFAULT_PERSONA;
