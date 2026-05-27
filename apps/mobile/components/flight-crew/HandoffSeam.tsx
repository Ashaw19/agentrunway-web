/**
 * apps/mobile/components/flight-crew/HandoffSeam.tsx
 *
 * Renders the narrated-handoff seam between two persona bubbles. Mobile
 * adapts the web's side-by-side seam (`apps/web/components/ai-chat.tsx`)
 * to a vertical small-screen treatment:
 *
 *   ──────── handing to Navigator ────────
 *
 * A thin line gradient in the target persona's accent color, with the
 * target's icon + a "handing to X" label centered. Renders BETWEEN the
 * speaker bubble (truncated to the handoff sentence) and the target's
 * incoming bubble. Lives inside the message list as its own row so
 * auto-scroll keeps it on-screen as the target persona starts streaming.
 *
 * See `memory/project_flight_crew_ui_design.md` (web seam design).
 * See `memory/project_flight_crew_direction.md` (handoff narration is
 *   audible / visible by design — not silent).
 */

import { View, Text } from "react-native";
import { useColors, Space, Type } from "@/lib/theme";
import { getPersona, type Persona } from "@/lib/flight-crew/personas";

export interface HandoffSeamProps {
  /** Persona the handoff is going TO. */
  target: Persona;
}

export function HandoffSeam({ target }: HandoffSeamProps) {
  const c = useColors();
  const meta = getPersona(target);
  const Icon = meta.icon;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Space.sm,
        marginVertical: Space.sm,
        paddingHorizontal: Space.md,
      }}
      accessibilityRole="text"
      accessibilityLabel={`Handing off to ${meta.name}`}
    >
      <View
        style={{
          flex: 1,
          height: 1,
          backgroundColor: meta.accent,
          opacity: 0.4,
        }}
      />
      <View
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
            ...Type.micro,
            color: meta.accentText,
            letterSpacing: 0.5,
          }}
        >
          handing to {meta.name.toLowerCase()}
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          height: 1,
          backgroundColor: meta.accent,
          opacity: 0.4,
        }}
      />
    </View>
  );
}
