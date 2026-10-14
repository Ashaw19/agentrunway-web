/**
 * DateField — a date-only (YYYY-MM-DD) field with an inline month calendar.
 *
 * Tapping the field opens the calendar under it (no modal: these fields sit
 * inside bottom sheets, and a modal over a modal is unreliable on iOS). Dates
 * are calendar days on the phone, built with the local-noon anchor so no time
 * zone can shift them (core/lib/local-date).
 */

import { useMemo, useState } from "react";
import { isYearlessBirthdate } from "@agent-runway/core/lib/contact-match";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { addDaysISO, localISODate } from "@agent-runway/core/lib/local-date";
import { useColors, Space, Radius, Type } from "@/lib/theme";

interface DateFieldProps {
  label: string;
  /** YYYY-MM-DD, or "" for none (only when `clearable`). */
  value: string;
  onChange: (iso: string) => void;
  /** Shows a "Clear" chip and lets the value be "". */
  clearable?: boolean;
  /** Shown when the value is "". */
  placeholder?: string;
  /** Today / Yesterday chips (closing dates). Off for dates that are usually ahead. */
  pastShortcuts?: boolean;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** A date-only string at local noon, so getters read that calendar day. */
function noon(iso: string): Date {
  return new Date(iso + "T12:00:00");
}

export function formatDateLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  // A birthday from Contacts with no year is stored as 1604-MM-DD: show the day only.
  if (isYearlessBirthdate(iso)) {
    return noon(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  }
  return noon(iso).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DateField({
  label,
  value,
  onChange,
  clearable = false,
  placeholder = "Not set",
  pastShortcuts = true,
}: DateFieldProps) {
  const c = useColors();
  const today = localISODate();
  const [open, setOpen] = useState(false);
  // First day of the month on show.
  // A yearless birthday opens on this year's month, not 1604's.
  const startMonth = (v: string) =>
    (v && isYearlessBirthdate(v) ? `${today.slice(0, 4)}${v.slice(4, 7)}` : (v || today).slice(0, 7)) + "-01";
  const [month, setMonth] = useState(() => startMonth(value));

  const weeks = useMemo(() => {
    const first = noon(month);
    const lead = first.getDay(); // blanks before the 1st
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = month; d.slice(0, 7) === month.slice(0, 7); d = addDaysISO(d, 1)) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  const shiftMonth = (by: number) => {
    const d = noon(month);
    d.setMonth(d.getMonth() + by, 1);
    setMonth(localISODate(d));
  };

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const toggle = () => {
    if (!open) setMonth(startMonth(value));
    setOpen((o) => !o);
  };

  const chip = (text: string, onPress: () => void, active = false) => (
    <Pressable
      key={text}
      onPress={onPress}
      style={{
        paddingHorizontal: Space.md,
        height: 30,
        borderRadius: Radius.pill,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: active ? c.primary : c.cardBorder,
        backgroundColor: active ? c.primaryDim : c.card,
      }}
    >
      <Text style={[Type.caption, { color: active ? c.primary : c.textMuted, fontWeight: "600" }]}>{text}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: Space.xs }}>
      <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>{label}</Text>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDateLabel(value) : placeholder}`}
        style={{
          minHeight: 48,
          borderRadius: Radius.md,
          borderWidth: 1.5,
          borderColor: open ? c.primary : c.cardBorder,
          backgroundColor: c.card,
          paddingHorizontal: Space.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={[Type.body, { color: value ? c.text : c.textDim }]}>
          {value ? formatDateLabel(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={c.textDim} />
      </Pressable>

      {open && (
        <View
          style={{
            borderRadius: Radius.lg,
            borderWidth: 1,
            borderColor: c.cardBorder,
            backgroundColor: c.card,
            padding: Space.md,
            gap: Space.sm,
          }}
        >
          <View style={{ flexDirection: "row", gap: Space.sm, flexWrap: "wrap" }}>
            {chip("Today", () => pick(today), value === today)}
            {pastShortcuts && chip("Yesterday", () => pick(addDaysISO(today, -1)), value === addDaysISO(today, -1))}
            {!pastShortcuts && chip("Tomorrow", () => pick(addDaysISO(today, 1)), value === addDaysISO(today, 1))}
            {clearable && chip("Clear", () => pick(""))}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={Space.sm} accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={20} color={c.textMuted} />
            </Pressable>
            <Text style={[Type.bodyBold, { color: c.text }]}>
              {noon(month).toLocaleDateString("en-CA", { month: "long", year: "numeric" })}
            </Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={Space.sm} accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row" }}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[Type.micro, { flex: 1, textAlign: "center", color: c.textDim }]}>{w}</Text>
            ))}
          </View>
          {weeks.map((week, wi) => (
            <View key={wi} style={{ flexDirection: "row" }}>
              {week.map((iso, di) => {
                if (!iso) return <View key={di} style={{ flex: 1, height: 36 }} />;
                const selected = iso === value;
                const isToday = iso === today;
                return (
                  <Pressable
                    key={iso}
                    onPress={() => pick(iso)}
                    accessibilityLabel={formatDateLabel(iso)}
                    style={{ flex: 1, height: 36, alignItems: "center", justifyContent: "center" }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: selected ? c.primary : "transparent",
                        borderWidth: isToday && !selected ? 1 : 0,
                        borderColor: c.primary,
                      }}
                    >
                      <Text style={[Type.caption, { color: selected ? "#fff" : c.text, fontWeight: selected ? "700" : "500" }]}>
                        {Number(iso.slice(8))}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
