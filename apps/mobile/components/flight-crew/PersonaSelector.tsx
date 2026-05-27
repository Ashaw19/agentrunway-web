/**
 * apps/mobile/components/flight-crew/PersonaSelector.tsx
 *
 * Bottom-sheet persona switcher — the mobile equivalent of the web's
 * dropdown `PersonaSelector`. Tapping the active-persona chip in the
 * composer opens this sheet; picking a persona routes the NEXT user
 * message to that persona (matches web's "selector = persistent until
 * changed" semantics from `memory/project_flight_crew_direction.md`).
 *
 * @mention in the message body overrides the selector for that single
 * message only — same contract as the web client.
 */

import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { useColors, Radius, Space, Type, shadows, useTheme } from "@/lib/theme";
import {
  CREW_PERSONAS,
  getPersona,
  type Persona,
} from "@/lib/flight-crew/personas";

export interface PersonaSelectorProps {
  visible: boolean;
  /** Currently-active persona — shown with a check + filled accent. */
  active: Persona;
  onSelect: (p: Persona) => void;
  onClose: () => void;
}

export function PersonaSelector({
  visible,
  active,
  onSelect,
  onClose,
}: PersonaSelectorProps) {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close persona picker"
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: c.overlay,
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: Radius.xxl,
            borderTopRightRadius: Radius.xxl,
            paddingTop: Space.lg,
            paddingBottom: Space.xxxl,
            paddingHorizontal: Space.lg,
            ...sh.cardLg,
          }}
        >
          {/* Grab handle */}
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: c.textFaint,
              marginBottom: Space.lg,
            }}
          />
          <Text style={{ ...Type.h3, color: c.text, marginBottom: Space.md }}>
            Switch persona
          </Text>
          <Text
            style={{
              ...Type.caption,
              color: c.textMuted,
              marginBottom: Space.lg,
            }}
          >
            Choose who answers next. The Captain coordinates by default;
            Navigator owns finance and tax; Dispatcher owns clients and
            pipeline. You can also @mention a persona for a one-off.
          </Text>
          <ScrollView>
            {CREW_PERSONAS.map((meta) => {
              const isActive = meta.id === active;
              const Icon = meta.icon;
              return (
                <Pressable
                  key={meta.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${meta.name} — ${meta.domain}`}
                  onPress={() => {
                    onSelect(meta.id);
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Space.md,
                    padding: Space.md,
                    borderRadius: Radius.lg,
                    marginBottom: Space.sm,
                    backgroundColor: isActive
                      ? meta.accentTint
                      : pressed
                      ? c.bgElevated
                      : "transparent",
                    borderWidth: 1,
                    borderColor: isActive
                      ? meta.accent
                      : c.cardBorder,
                  })}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: meta.accentTint,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={20} color={meta.accent} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        ...Type.bodyBold,
                        color: isActive ? meta.accentText : c.text,
                      }}
                    >
                      {meta.name}
                      {isActive ? "  •  active" : ""}
                    </Text>
                    <Text
                      style={{ ...Type.caption, color: c.textMuted, marginTop: 2 }}
                    >
                      {meta.domain}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Compact persona-chip used in the composer to open the selector. */
export function PersonaChip({
  persona,
  onPress,
}: {
  persona: Persona;
  onPress: () => void;
}) {
  const c = useColors();
  const meta = getPersona(persona);
  const Icon = meta.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Active persona: ${meta.name}. Tap to switch.`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: Radius.pill,
        backgroundColor: meta.accentTint,
        borderWidth: 1,
        borderColor: pressed ? meta.accent : "transparent",
      })}
    >
      <Icon size={13} color={meta.accent} strokeWidth={2.25} />
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: meta.accentText,
        }}
      >
        {meta.name}
      </Text>
      <Text style={{ fontSize: 10, color: c.textMuted }}>▾</Text>
    </Pressable>
  );
}
