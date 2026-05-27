/**
 * apps/mobile/components/flight-crew/PersonaAvatar.tsx
 *
 * Circular persona avatar for chat message bubbles. Mobile equivalent of
 * `apps/web/components/flight-crew/persona-badge.tsx` "avatar" variant.
 *
 * Pure display component — no state, no event handlers. Always renders the
 * persona's icon centered on its tinted background circle.
 */

import { View } from "react-native";
import { getPersona, type Persona } from "@/lib/flight-crew/personas";

export interface PersonaAvatarProps {
  persona: Persona | string | null | undefined;
  /** Diameter in pixels. Default 32 — matches web's h-8/w-8. */
  size?: number;
}

export function PersonaAvatar({ persona, size = 32 }: PersonaAvatarProps) {
  const meta = getPersona(persona);
  const Icon = meta.icon;
  const iconSize = Math.round(size * 0.5);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${meta.name} — ${meta.domain}`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: meta.accentTint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={iconSize} color={meta.accent} strokeWidth={2} />
    </View>
  );
}
