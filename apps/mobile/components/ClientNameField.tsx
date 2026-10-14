/**
 * ClientNameField — the client on a deal: free text, as on web, with
 * suggestions from the client list so a pick spells the name the way the
 * CRM has it.
 *
 * `transactions` stores the client as `client_name` text (no client FK; the
 * CRM's per-client link runs through client_records), so picking a client
 * fills the name and nothing else.
 */

import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Input } from "@/components/ui/Input";
import { useDataStore } from "@/stores/data-store";
import { useColors, Space, Radius, Type } from "@/lib/theme";

interface ClientNameFieldProps {
  label: string;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}

const MAX_SUGGESTIONS = 5;

export function ClientNameField({ label, value, onChange, placeholder }: ClientNameFieldProps) {
  const c = useColors();
  const clients = useDataStore((s) => s.clients);
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!focused || q.length < 1) return [];
    return clients
      .filter((cl) => !cl.archived_at && cl.name.toLowerCase().includes(q) && cl.name.toLowerCase() !== q)
      .slice(0, MAX_SUGGESTIONS);
  }, [clients, value, focused]);

  return (
    <View style={{ gap: Space.xs }}>
      <Input
        label={label}
        value={value}
        onChange={(text) => {
          setFocused(true);
          onChange(text);
        }}
        placeholder={placeholder}
      />
      {suggestions.length > 0 && (
        <View
          style={{
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: c.cardBorder,
            backgroundColor: c.card,
            overflow: "hidden",
          }}
        >
          {suggestions.map((cl, i) => (
            <Pressable
              key={cl.id}
              onPress={() => {
                onChange(cl.name);
                setFocused(false);
              }}
              style={{
                paddingHorizontal: Space.lg,
                paddingVertical: Space.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.divider,
              }}
            >
              <Text style={[Type.body, { color: c.text }]}>{cl.name}</Text>
              {(cl.email || cl.phone) && (
                <Text style={[Type.micro, { color: c.textDim }]} numberOfLines={1}>
                  {cl.email ?? cl.phone}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
