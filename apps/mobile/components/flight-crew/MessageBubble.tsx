/**
 * apps/mobile/components/flight-crew/MessageBubble.tsx
 *
 * Renders a single chat message — user OR assistant. Assistant bubbles
 * are persona-tinted: avatar on the left, persona name + text stacked,
 * accent-colored top-left corner border. User bubbles are right-aligned,
 * neutral.
 *
 * Adapted from `apps/web/components/ai-chat.tsx` (the assistant-bubble +
 * user-bubble visual treatment) for vertical small-screen — no side-by-
 * side panels. See `memory/project_flight_crew_ui_design.md`.
 */

import { View, Text, ActivityIndicator } from "react-native";
import { useColors, Radius, Space, Type } from "@/lib/theme";
import { getPersona, type Persona } from "@/lib/flight-crew/personas";
import { PersonaAvatar } from "./PersonaAvatar";
import { PersonaInline } from "./PersonaInline";

export interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  persona?: Persona;
  pending?: boolean;
  /** Approval-required notice — Phase A renders a short inline line saying
   *  the action needs to be confirmed in the web app. */
  approvalDeferred?: { toolName: string; description: string };
}

export function MessageBubble({
  role,
  content,
  persona,
  pending,
  approvalDeferred,
}: MessageBubbleProps) {
  const c = useColors();

  if (role === "user") {
    return (
      <View
        style={{
          alignSelf: "flex-end",
          maxWidth: "85%",
          marginBottom: Space.md,
          backgroundColor: c.primary,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm + 2,
          borderRadius: Radius.xl,
          borderBottomRightRadius: 4,
        }}
        accessibilityRole="text"
      >
        <Text style={{ ...Type.body, color: "#FFFFFF" }}>{content}</Text>
      </View>
    );
  }

  const meta = getPersona(persona);
  return (
    <View
      style={{
        alignSelf: "flex-start",
        maxWidth: "92%",
        marginBottom: Space.md,
        flexDirection: "row",
        gap: Space.sm,
      }}
      accessibilityRole="text"
      accessibilityLabel={`${meta.name}: ${content}`}
    >
      <PersonaAvatar persona={meta.id} size={32} />
      <View style={{ flex: 1 }}>
        <View style={{ marginBottom: 4 }}>
          <PersonaInline persona={meta.id} />
        </View>
        <View
          style={{
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.cardBorder,
            borderLeftWidth: 3,
            borderLeftColor: meta.accent,
            paddingHorizontal: Space.md,
            paddingVertical: Space.sm + 2,
            borderRadius: Radius.xl,
            borderTopLeftRadius: 4,
          }}
        >
          {content.length === 0 && pending ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color={meta.accent} />
              <Text style={{ ...Type.caption, color: c.textMuted }}>
                {meta.name} is thinking…
              </Text>
            </View>
          ) : (
            <Text style={{ ...Type.body, color: c.text }}>{content}</Text>
          )}
          {approvalDeferred && (
            <View
              style={{
                marginTop: Space.sm,
                padding: Space.sm,
                borderRadius: Radius.md,
                backgroundColor: c.warningDim,
                borderWidth: 1,
                borderColor: c.warning,
              }}
            >
              <Text style={{ ...Type.caption, color: c.text, fontWeight: "600" }}>
                Confirmation needed
              </Text>
              <Text style={{ ...Type.caption, color: c.textSecondary, marginTop: 2 }}>
                {approvalDeferred.description} — open the web app to approve.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
