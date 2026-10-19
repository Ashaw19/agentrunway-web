/**
 * Mileage: log a business trip, enter the odometer readings the logbook
 * asks for, and see this year's vehicle business use.
 *
 * Mobile scope is capture and glance (project_mobile_vs_web_scope_policy):
 * a trip just driven, a reading just taken off the dashboard. Vehicles and
 * logbook periods are set up on the web (Expenses, Mileage); nothing here
 * creates or edits them.
 *
 * Reads and writes are core's (stores/mileage-store.ts). The business use
 * line is `vehicleBusinessUseFor`, the resolver every surface uses, so the
 * phone shows the same share and the same label as the web. No km × CRA
 * per-km rate figure is shown here.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { localISODate } from "@agent-runway/core/lib/local-date";
import {
  defaultVehicleId,
  vehicleBusinessUseFor,
  type ReadingDue,
} from "@agent-runway/core/engines/vehicle-logbook-engine";
import { CANONICAL_TAX_DISCLAIMER_SHORT, SIMPLIFIED_LOGBOOK_RULE, VEHICLE_LOGBOOK_RULE } from "@agent-runway/core/tax-copy";
import type { MileagePlace } from "@agent-runway/core/types/database";
import { useDataStore } from "@/stores/data-store";
import { useMileageStore, RECENT_TRIPS_SHOWN, type RecentTrip } from "@/stores/mileage-store";
import { Button, EmptyState, Input, Sheet } from "@/components/ui";
import { DateField } from "@/components/ui/DateField";
import { useColors, useTheme, shadows, Space, Radius, Type } from "@/lib/theme";
import { MILEAGE_TRIP_PURPOSES } from "@agent-runway/core/lib/vehicle-logbook-writes";

/** The same suggestions as the web Mileage tab (one list, in core). */
const PURPOSES = MILEAGE_TRIP_PURPOSES;

type DistanceMode = "km" | "odometer";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * A typed distance or odometer figure. Blank is null; anything that is not a
 * number comes back NaN and the core writer says what is wrong. "12,5" (a
 * decimal comma) is 12.5; "45,678" (a thousands comma) is 45678.
 */
function parseKmInput(s: string): number | null {
  let t = s.replace(/\s/g, "");
  if (!t) return null;
  if (!t.includes(".") && /^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  return Number(t);
}

function fmtKm(km: number): string {
  return `${km.toLocaleString("en-CA", { maximumFractionDigits: 1 })} km`;
}

/** "Oct 18": a date-only value at local noon, so no time zone moves the day. */
function shortDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

const placeText = (p: MileagePlace) => (p.address?.trim() ? `${p.name}, ${p.address.trim()}` : p.name);
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ── Screen ─────────────────────────────────────────────────────────────────

export default function MileageScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const settings = useDataStore((s) => s.settings);
  const { logbook, logbookYear, places, trips, loaded, error, fetch, logTrip, recordReading } = useMileageStore();
  const [refreshing, setRefreshing] = useState(false);

  // ── Trip form ──
  const [tripDate, setTripDate] = useState(() => localISODate());
  const [pickedVehicleId, setPickedVehicleId] = useState<string | null>(null);
  const [distanceMode, setDistanceMode] = useState<DistanceMode>("km");
  const [km, setKm] = useState("");
  const [odoStart, setOdoStart] = useState("");
  const [odoEnd, setOdoEnd] = useState("");
  const [fromLoc, setFromLoc] = useState("");
  const [toLoc, setToLoc] = useState("");
  const [purpose, setPurpose] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [savePlace, setSavePlace] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Odometer reading sheet ──
  const [readingFor, setReadingFor] = useState<ReadingDue | null>(null);
  const [readingKm, setReadingKm] = useState("");
  const [savingReading, setSavingReading] = useState(false);

  const [showRules, setShowRules] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetch();
      // The declared share comes from user_settings; load it if the app has not yet.
      const data = useDataStore.getState();
      if (!data.settings) data.fetchAll();
    }, [fetch]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  }, [fetch]);

  const today = localISODate();
  const year = Number(today.slice(0, 4));
  // Rows for another year (the app was left open over New Year's) are not this year's.
  const rows = logbook && logbookYear === year ? logbook : null;
  const use = useMemo(
    () => (rows ? vehicleBusinessUseFor(settings, rows, year, today) : null),
    [settings, rows, year, today],
  );

  const vehicles = useMemo(() => rows?.vehicles ?? [], [rows]);
  const activeVehicles = useMemo(() => vehicles.filter((v) => v.is_active), [vehicles]);
  const defaultId = useMemo(() => defaultVehicleId(vehicles), [vehicles]);
  const vehicleId =
    pickedVehicleId && activeVehicles.some((v) => v.id === pickedVehicleId) ? pickedVehicleId : defaultId;
  const vehicleName = useCallback(
    (id: string | null) => vehicles.find((v) => v.id === (id ?? defaultId))?.name ?? "",
    [vehicles, defaultId],
  );

  const startKm = parseKmInput(odoStart);
  const endKm = parseKmInput(odoEnd);
  const odometerKm =
    startKm != null && endKm != null && Number.isFinite(startKm) && Number.isFinite(endKm) && endKm >= startKm
      ? Math.round((endKm - startKm) * 10) / 10
      : null;

  const toMatchesPlace = places.some((p) => sameText(p.name, toLoc) || sameText(placeText(p), toLoc));
  const canSavePlace = toLoc.trim().length > 0 && !toMatchesPlace;
  const lastTrip = trips[0] ?? null;

  const resetForm = () => {
    setTripDate(localISODate());
    setDistanceMode("km");
    setKm("");
    setOdoStart("");
    setOdoEnd("");
    setFromLoc("");
    setToLoc("");
    setPurpose(null);
    setDescription("");
    setSavePlace(false);
  };

  const pickPlace = (p: MileagePlace) => {
    setToLoc(placeText(p));
    setSavePlace(false);
    if (p.default_km != null && Number(p.default_km) > 0) {
      setDistanceMode("km");
      setKm(String(Number(p.default_km)));
    }
  };

  const repeatLastTrip = (t: RecentTrip) => {
    setTripDate(localISODate());
    setDescription(t.description);
    setFromLoc(t.from_location ?? "");
    setToLoc(t.to_location ?? "");
    setDistanceMode("km");
    setKm(t.km > 0 ? String(t.km) : "");
    setOdoStart("");
    setOdoEnd("");
    setPurpose(t.purpose);
    setPickedVehicleId(t.vehicle_id);
    setSavePlace(false);
  };

  const saveTrip = async () => {
    if (saving) return;
    setSaving(true);
    const to = toLoc.trim();
    const ok = await logTrip(
      {
        tripDate,
        description,
        km: distanceMode === "km" ? parseKmInput(km) : null,
        odometerStart: distanceMode === "odometer" ? startKm : null,
        odometerEnd: distanceMode === "odometer" ? endKm : null,
        vehicleId,
        fromLocation: fromLoc,
        toLocation: to,
        purpose,
      },
      savePlace && canSavePlace
        ? { name: to.slice(0, 80), address: to.length > 80 ? to.slice(0, 200) : null }
        : null,
    );
    setSaving(false);
    if (ok) resetForm();
  };

  const openReading = (r: ReadingDue) => {
    setReadingKm("");
    setReadingFor(r);
  };

  const saveReading = async () => {
    if (!readingFor || savingReading) return;
    setSavingReading(true);
    const value = parseKmInput(readingKm);
    const ok = await recordReading({
      kind: readingFor.kind,
      vehicleId: readingFor.vehicleId,
      periodId: readingFor.periodId,
      date: readingFor.date,
      km: value ?? Number.NaN,
    });
    setSavingReading(false);
    if (ok) setReadingFor(null);
  };

  // ── Small pieces ──

  const chip = (label: string, active: boolean, onPress: () => void, key?: string) => (
    <Pressable
      key={key ?? label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        paddingHorizontal: Space.md,
        minHeight: 34,
        borderRadius: Radius.pill,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: active ? c.primary : c.cardBorder,
        backgroundColor: active ? c.primaryDim : c.card,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={[Type.caption, { color: active ? c.primary : c.textMuted, fontWeight: "600" }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  const card = {
    padding: Space.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.cardBorder,
    backgroundColor: c.card,
    gap: Space.md,
    ...sh.card,
  } as const;

  const sectionTitle = (text: string) => <Text style={[Type.label, { color: c.textMuted }]}>{text}</Text>;

  const showReadings = !!use && (use.readingsDue.length > 0 || use.progress.length > 0);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: Space.xl, paddingBottom: 120, gap: Space.xl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {error && (
          <View style={{ padding: Space.md, borderRadius: Radius.md, backgroundColor: c.dangerDim }}>
            <Text style={[Type.caption, { color: c.danger }]}>{`${error} Pull down to try again.`}</Text>
          </View>
        )}

        {/* ── Log a trip ── */}
        <View style={{ gap: Space.sm }}>
          {sectionTitle("Log a trip")}
          <View style={card}>
            {lastTrip && (
              <Pressable
                onPress={() => repeatLastTrip(lastTrip)}
                accessibilityRole="button"
                accessibilityLabel={`Repeat last trip: ${lastTrip.description}`}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Space.md,
                  padding: Space.md,
                  borderRadius: Radius.md,
                  backgroundColor: c.primaryDim,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons name="repeat" size={20} color={c.primary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[Type.bodyBold, { color: c.primary }]}>Repeat last trip</Text>
                  <Text style={[Type.caption, { color: c.textMuted }]} numberOfLines={1}>
                    {`${lastTrip.description} · ${fmtKm(lastTrip.km)}`}
                  </Text>
                </View>
              </Pressable>
            )}

            <DateField label="Date" value={tripDate} onChange={setTripDate} />

            {activeVehicles.length > 1 && (
              <View style={{ gap: Space.xs }}>
                <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>Vehicle</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
                  {activeVehicles.map((v) => chip(v.name, v.id === vehicleId, () => setPickedVehicleId(v.id), v.id))}
                </View>
              </View>
            )}

            <Input
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="Where and why, e.g. Client showing, 123 Main St"
            />

            <View style={{ gap: Space.xs }}>
              <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>Purpose</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
                {PURPOSES.map((p) => chip(p, purpose === p, () => setPurpose(purpose === p ? null : p)))}
              </View>
            </View>

            <Input label="From" value={fromLoc} onChange={setFromLoc} placeholder="e.g. Home office" />
            <Input label="To" value={toLoc} onChange={setToLoc} placeholder="e.g. 123 Main St" />
            {places.length > 0 && (
              <View style={{ gap: Space.xs }}>
                <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>Saved places</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
                  {places.map((p) => chip(p.name, sameText(placeText(p), toLoc), () => pickPlace(p), p.id))}
                </View>
              </View>
            )}

            <View style={{ gap: Space.xs }}>
              <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>Distance</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
                {chip("Km driven", distanceMode === "km", () => setDistanceMode("km"))}
                {chip("Odometer start and end", distanceMode === "odometer", () => setDistanceMode("odometer"))}
              </View>
            </View>
            {distanceMode === "km" ? (
              <Input label="Km" value={km} onChange={setKm} placeholder="0" keyboardType="decimal-pad" />
            ) : (
              <View style={{ gap: Space.xs }}>
                <View style={{ flexDirection: "row", gap: Space.md }}>
                  <View style={{ flex: 1 }}>
                    <Input label="Odometer at start" value={odoStart} onChange={setOdoStart} placeholder="km" keyboardType="decimal-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input label="Odometer at end" value={odoEnd} onChange={setOdoEnd} placeholder="km" keyboardType="decimal-pad" />
                  </View>
                </View>
                {odometerKm != null && (
                  <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>
                    {`Trip: ${fmtKm(odometerKm)}`}
                  </Text>
                )}
              </View>
            )}

            {canSavePlace && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: Space.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={[Type.bodyBold, { color: c.text }]}>Save as a place</Text>
                  <Text style={[Type.caption, { color: c.textDim }]}>
                    Adds this destination and its km to your saved places.
                  </Text>
                </View>
                <Switch
                  value={savePlace}
                  onValueChange={setSavePlace}
                  trackColor={{ false: c.textFaint, true: c.primary }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={c.textFaint}
                />
              </View>
            )}

            <Button label="Save trip" icon="checkmark" onPress={saveTrip} loading={saving} />
          </View>
        </View>

        {/* ── Odometer readings ── */}
        {showReadings && use && (
          <View style={{ gap: Space.sm }}>
            {sectionTitle("Odometer readings")}
            <View style={card}>
              {use.readingsDue.length > 0 ? (
                use.readingsDue.map((r) => (
                  <Pressable
                    key={`${r.periodId}-${r.kind}-${r.date}`}
                    onPress={() => openReading(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`${r.label}, ${r.vehicleName}. Enter the reading.`}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: Space.md,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="speedometer-outline" size={22} color={c.warning} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[Type.bodyBold, { color: c.text }]}>{r.label}</Text>
                      <Text style={[Type.caption, { color: c.textDim }]} numberOfLines={1}>{r.vehicleName}</Text>
                    </View>
                    <Text style={[Type.caption, { color: c.primary, fontWeight: "700" }]}>Enter</Text>
                  </Pressable>
                ))
              ) : (
                <>
                  <Text style={[Type.caption, { color: c.textMuted }]}>No readings due right now.</Text>
                  {use.progress.map((p) => (
                    <View key={p.periodId} style={{ flexDirection: "row", gap: Space.sm, alignItems: "flex-start" }}>
                      <Ionicons
                        name={p.complete ? "checkmark-circle" : "time-outline"}
                        size={18}
                        color={p.complete ? c.success : c.textDim}
                      />
                      <Text style={[Type.caption, { flex: 1, color: c.textSecondary }]}>{p.label}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>
        )}

        {/* ── Vehicle business use ── */}
        <View style={{ gap: Space.sm }}>
          {sectionTitle("Vehicle business use")}
          <View style={card}>
            {use ? (
              <>
                <Text style={[Type.body, { color: c.text }]}>{use.label}</Text>
                {use.notes.map((n) => (
                  <Text key={n} style={[Type.caption, { color: c.textDim }]}>{n}</Text>
                ))}
                {use.method === "declared" && (
                  <Text style={[Type.caption, { color: c.textMuted }]}>
                    Logbook periods and vehicles are set up on the web, under Expenses, Mileage.
                  </Text>
                )}
              </>
            ) : loaded ? (
              <Text style={[Type.caption, { color: c.danger }]}>
                The logbook did not load, so the business use is not shown. Pull down to try again.
              </Text>
            ) : (
              <ActivityIndicator color={c.primary} />
            )}

            <Pressable
              onPress={() => setShowRules((s) => !s)}
              accessibilityRole="button"
              style={{ flexDirection: "row", alignItems: "center", gap: Space.xs }}
            >
              <Text style={[Type.caption, { color: c.primary, fontWeight: "600" }]}>{"CRA's logbook rules"}</Text>
              <Ionicons name={showRules ? "chevron-up" : "chevron-down"} size={14} color={c.primary} />
            </Pressable>
            {showRules && (
              <View style={{ gap: Space.sm }}>
                <Text style={[Type.caption, { color: c.textSecondary }]}>{VEHICLE_LOGBOOK_RULE}</Text>
                <Text style={[Type.caption, { color: c.textSecondary }]}>{SIMPLIFIED_LOGBOOK_RULE}</Text>
              </View>
            )}

            <Text style={[Type.micro, { color: c.textDim }]}>{CANONICAL_TAX_DISCLAIMER_SHORT}</Text>
          </View>
        </View>

        {/* ── Recent trips ── */}
        <View style={{ gap: Space.sm }}>
          {sectionTitle("Recent trips")}
          {!loaded ? (
            <ActivityIndicator color={c.primary} />
          ) : trips.length === 0 ? (
            <EmptyState
              icon="car-outline"
              title="No trips logged this year"
              subtitle="Trips logged here or on the web show in this list."
            />
          ) : (
            <>
              {trips.map((t) => {
                const route = [t.from_location, t.to_location].filter((s) => s && s.trim()).join(" → ");
                const meta = [shortDate(t.trip_date), t.purpose, vehicles.length > 1 ? vehicleName(t.vehicle_id) : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <View key={t.id} style={[card, { gap: Space.xs }]}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: Space.md }}>
                      <Text style={[Type.bodyBold, { flex: 1, color: c.text }]} numberOfLines={2}>
                        {t.description || "Trip"}
                      </Text>
                      <Text style={[Type.bodyBold, { color: c.primary }]}>{fmtKm(t.km)}</Text>
                    </View>
                    <Text style={[Type.caption, { color: c.textDim }]} numberOfLines={1}>{meta}</Text>
                    {route ? (
                      <Text style={[Type.caption, { color: c.textMuted }]} numberOfLines={2}>{route}</Text>
                    ) : null}
                  </View>
                );
              })}
              {trips.length >= RECENT_TRIPS_SHOWN && (
                <Text style={[Type.caption, { color: c.textDim, textAlign: "center" }]}>
                  {`Showing the ${RECENT_TRIPS_SHOWN} most recent trips this year. The full log is on the web.`}
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Sheet visible={readingFor != null} onClose={() => setReadingFor(null)} title="Odometer reading">
        {readingFor && (
          <View style={{ gap: Space.lg, paddingBottom: Space.lg }}>
            <View style={{ gap: Space.xs }}>
              <Text style={[Type.bodyBold, { color: c.text }]}>{readingFor.label}</Text>
              <Text style={[Type.caption, { color: c.textDim }]}>{readingFor.vehicleName}</Text>
            </View>
            <Input
              label="Odometer (km)"
              value={readingKm}
              onChange={setReadingKm}
              placeholder="e.g. 45678"
              keyboardType="decimal-pad"
            />
            <Button label="Save reading" icon="checkmark" onPress={saveReading} loading={savingReading} />
          </View>
        )}
      </Sheet>
    </KeyboardAvoidingView>
  );
}
