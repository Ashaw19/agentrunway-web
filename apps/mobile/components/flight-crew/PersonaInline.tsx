/**
 * apps/mobile/components/flight-crew/PersonaInline.tsx
 *
 * Inline icon + name pill — mobile equivalent of the web `PersonaBadge`
 * "inline" variant. Used in the chat composer's active-persona indicator
 * and the message bubble header above an assistant reply.
 */

import { View, Text } from "react-native";
import { getPersona, type Persona } from "@/lib/flight-crew/personas";

export interface PersonaInlineProps {
  persona: Persona | string | null | undefined;
  /** Hide the persona name and render only the icon. Default false. */
  iconOnly?: boolean;
  /** Optional override label (e.g. "Switched to Navigator"). */
  label?: string;
}

export function PersonaInline({ persona, iconOnly, label }: PersonaInlineProps) {
  const meta = getPersona(persona);
  const Icon = meta.icon;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${meta.name} — ${meta.domain}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
    >
      <Icon size={14} color={meta.accent} strokeWidth={2.25} />
      {!iconOnly && (
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: meta.accentText,
            letterSpacing: 0.1,
          }}
        >
          {label ?? meta.name}
        </Text>
      )}
    </View>
  );
}
