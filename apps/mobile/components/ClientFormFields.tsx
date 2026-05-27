/**
 * Shared client form fields — used by both AddClientSheet (clients.tsx)
 * and the edit mode of ClientDetailSheet. Closes mobile parity audit
 * gap #7: every field the web add/edit-client form exposes is reachable
 * here.
 *
 * The web counterpart lives at
 * `apps/web/app/(app)/crm/clients-content.tsx` (search for
 * `setNewClientFirstName`, `handleAddClient`). The set of columns + their
 * defaults match `packages/core/types/database.ts` (`Client` interface) and
 * the migration history.
 *
 * Layout intent: sectioned scroll, not tabs — keeps the long form
 * accessible on small screens, lets the user pick the section they need,
 * and works correctly inside the bottom-sheet pattern the app already
 * uses. Every section is collapsible; only Identity expands by default.
 *
 * Validation is intentionally light here — the heavy lifting (sale price,
 * commission, etc.) lives in `@agent-runway/core/validation/input-guards`.
 * Caller passes the parsed state to `addClient` / `updateClient` after
 * `validateClient` confirms email + phone shape.
 */

import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useColors, Space, Radius, Type } from "@/lib/theme";
import { Input } from "@/components/ui/Input";

// ── Canonical option sets (mirror packages/core/types/database.ts) ─────────

export const PREFERRED_CONTACT_OPTIONS = ["phone", "email", "text"] as const;
export const PHONE_TYPE_OPTIONS = ["mobile", "home", "work", "other"] as const;
export const COMMUNICATION_TONE_OPTIONS = [
  "casual",
  "friendly",
  "professional",
  "formal",
] as const;
export const TIMEFRAME_OPTIONS = [
  "asap",
  "1_3_months",
  "3_6_months",
  "6_12_months",
  "12_plus",
  "unknown",
] as const;
export const PROPERTY_INTEREST_TYPE_OPTIONS = ["budget", "listing"] as const;
export const BUYER_FINANCING_OPTIONS = [
  "mortgage",
  "cash",
  "bridge",
  "unknown",
] as const;
export const ARCHIVE_REASON_OPTIONS = [
  "deceased",
  "moved_away",
  "do_not_contact",
  "other",
] as const;

/**
 * Lead source list — mirrors `LEAD_SOURCE_GROUPS` in
 * `apps/web/app/(app)/crm/clients-content.tsx` line 288. Flat for mobile
 * (grouping happens via short separator labels rendered between picks).
 * Update both sides together when the canonical list changes.
 */
export const LEAD_SOURCE_OPTIONS: string[] = [
  // Personal Network
  "SOI",
  "Referral — Past Client",
  "Referral — Agent",
  "Referral — General",
  // Portals
  "Realtor.ca",
  "Zillow",
  "Zolo",
  "HouseSigma",
  "Point2 Homes",
  // Brokerages
  "Royal LePage",
  "RE/MAX",
  "EXIT Realty",
  "Century 21",
  "REAL Broker",
  "eXp Realty",
  "Keller Williams",
  "Brokerage Website",
  // Events & Outreach
  "Open House",
  "Door Knocking",
  "Direct Mail",
  "Sphere Event",
  // Digital
  "Social Media",
  "Google Ads",
  "Facebook Ads",
  "YouTube",
  "TikTok",
  "Podcast / Media",
  "Cold Call",
  // Other
  "Other",
];

// ── Field state shape ────────────────────────────────────────────────────────

export interface ClientFormState {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  phone_type: (typeof PHONE_TYPE_OPTIONS)[number];
  secondary_email: string;
  secondary_phone: string;
  secondary_phone_type: (typeof PHONE_TYPE_OPTIONS)[number];
  preferred_contact: (typeof PREFERRED_CONTACT_OPTIONS)[number];
  communication_tone: (typeof COMMUNICATION_TONE_OPTIONS)[number];
  lead_source: string;
  notes: string;
  birthdate: string; // YYYY-MM-DD

  // Address
  street_address: string;
  unit_number: string;
  city: string;
  province_region: string;
  postal_code: string;
  country: string;

  // Property interest
  property_interest: string; // numeric input as string
  property_interest_type: (typeof PROPERTY_INTEREST_TYPE_OPTIONS)[number];
  timeframe: (typeof TIMEFRAME_OPTIONS)[number] | "";

  // Buyer profile
  buyer_pre_approved: boolean | null;
  buyer_pre_approval_amount: string;
  buyer_financing_type: (typeof BUYER_FINANCING_OPTIONS)[number] | "";
  buyer_target_close_date: string; // YYYY-MM-DD
  buyer_target_area: string;
}

export const EMPTY_CLIENT_FORM: ClientFormState = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  phone_type: "mobile",
  secondary_email: "",
  secondary_phone: "",
  secondary_phone_type: "mobile",
  preferred_contact: "phone",
  communication_tone: "friendly",
  lead_source: "",
  notes: "",
  birthdate: "",
  street_address: "",
  unit_number: "",
  city: "",
  province_region: "",
  postal_code: "",
  country: "Canada",
  property_interest: "",
  property_interest_type: "budget",
  timeframe: "",
  buyer_pre_approved: null,
  buyer_pre_approval_amount: "",
  buyer_financing_type: "",
  buyer_target_close_date: "",
  buyer_target_area: "",
};

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const c = useColors();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View
      style={{
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: c.cardBorder,
        backgroundColor: c.card,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: Space.sm,
          paddingHorizontal: Space.md,
          paddingVertical: Space.md,
          opacity: pressed ? 0.7 : 1,
        })}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        {open ? (
          <ChevronDown size={16} color={c.textMuted} />
        ) : (
          <ChevronRight size={16} color={c.textMuted} />
        )}
        <Text style={[Type.bodyBold, { color: c.text, flex: 1 }]}>{title}</Text>
      </Pressable>
      {open && (
        <View
          style={{
            paddingHorizontal: Space.md,
            paddingBottom: Space.md,
            gap: Space.md,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

// ── Pill chooser ─────────────────────────────────────────────────────────────

function PillRow<T extends string>({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  optionLabel: (opt: T) => string;
  onChange: (next: T) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: Space.xs }}>
      <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={({ pressed }) => ({
                paddingHorizontal: Space.md,
                height: 32,
                borderRadius: Radius.pill,
                borderWidth: 1,
                borderColor: selected ? c.primary : c.cardBorder,
                backgroundColor: selected ? c.primaryDim : "transparent",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={[
                  Type.caption,
                  {
                    color: selected ? c.primary : c.textSecondary,
                    fontWeight: selected ? "700" : "500",
                  },
                ]}
              >
                {optionLabel(opt)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Lead source picker (long list — uses scrolling pill grid) ───────────────

function LeadSourcePicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  const c = useColors();
  return (
    <View style={{ gap: Space.xs }}>
      <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
        {["", ...LEAD_SOURCE_OPTIONS].map((opt) => {
          const selected = value === opt;
          const display = opt === "" ? "—" : opt;
          return (
            <Pressable
              key={opt || "_none"}
              onPress={() => onChange(opt)}
              style={({ pressed }) => ({
                paddingHorizontal: Space.md,
                height: 30,
                borderRadius: Radius.pill,
                borderWidth: 1,
                borderColor: selected ? c.primary : c.cardBorder,
                backgroundColor: selected ? c.primaryDim : "transparent",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={[
                  Type.caption,
                  {
                    color: selected ? c.primary : c.textSecondary,
                    fontWeight: selected ? "700" : "500",
                    fontSize: 11,
                  },
                ]}
              >
                {display}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── The form ─────────────────────────────────────────────────────────────────

export interface ClientFormFieldsProps {
  state: ClientFormState;
  setState: (patch: Partial<ClientFormState>) => void;
}

export function ClientFormFields({ state, setState }: ClientFormFieldsProps) {
  const { t } = useTranslation("clients");

  return (
    <View style={{ gap: Space.md }}>
      {/* ── Identity ── */}
      <Section title={t("form.sections.identity")} defaultOpen>
        <View style={{ flexDirection: "row", gap: Space.sm }}>
          <View style={{ flex: 1 }}>
            <Input
              label={t("form.firstName")}
              value={state.first_name}
              onChange={(v) => setState({ first_name: v })}
              placeholder={t("form.firstNamePlaceholder")}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label={t("form.lastName")}
              value={state.last_name}
              onChange={(v) => setState({ last_name: v })}
              placeholder={t("form.lastNamePlaceholder")}
            />
          </View>
        </View>
        <Input
          label={t("form.birthdate")}
          value={state.birthdate}
          onChange={(v) => setState({ birthdate: v })}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
        />
        <LeadSourcePicker
          label={t("form.leadSource")}
          value={state.lead_source}
          onChange={(v) => setState({ lead_source: v })}
        />
      </Section>

      {/* ── Contact ── */}
      <Section title={t("form.sections.contact")}>
        <Input
          label={t("form.email")}
          value={state.email}
          onChange={(v) => setState({ email: v })}
          placeholder="jane@example.com"
          keyboardType="email-address"
        />
        <Input
          label={t("form.phone")}
          value={state.phone}
          onChange={(v) => setState({ phone: v })}
          placeholder="+1 (555) 123-4567"
          keyboardType="phone-pad"
        />
        <PillRow
          label={t("form.phoneType")}
          value={state.phone_type}
          options={PHONE_TYPE_OPTIONS}
          optionLabel={(o) => t(`form.phoneTypeOptions.${o}`)}
          onChange={(v) => setState({ phone_type: v })}
        />
        <Input
          label={t("form.secondaryEmail")}
          value={state.secondary_email}
          onChange={(v) => setState({ secondary_email: v })}
          placeholder="jane.work@example.com"
          keyboardType="email-address"
        />
        <Input
          label={t("form.secondaryPhone")}
          value={state.secondary_phone}
          onChange={(v) => setState({ secondary_phone: v })}
          placeholder="+1 (555) 765-4321"
          keyboardType="phone-pad"
        />
        <PillRow
          label={t("form.secondaryPhoneType")}
          value={state.secondary_phone_type}
          options={PHONE_TYPE_OPTIONS}
          optionLabel={(o) => t(`form.phoneTypeOptions.${o}`)}
          onChange={(v) => setState({ secondary_phone_type: v })}
        />
        <PillRow
          label={t("form.preferredContact")}
          value={state.preferred_contact}
          options={PREFERRED_CONTACT_OPTIONS}
          optionLabel={(o) => t(`form.preferredContactOptions.${o}`)}
          onChange={(v) => setState({ preferred_contact: v })}
        />
      </Section>

      {/* ── Address ── */}
      <Section title={t("form.sections.address")}>
        <Input
          label={t("form.streetAddress")}
          value={state.street_address}
          onChange={(v) => setState({ street_address: v })}
          placeholder={t("form.streetAddressPlaceholder")}
        />
        <Input
          label={t("form.unitNumber")}
          value={state.unit_number}
          onChange={(v) => setState({ unit_number: v })}
          placeholder={t("form.unitNumberPlaceholder")}
        />
        <View style={{ flexDirection: "row", gap: Space.sm }}>
          <View style={{ flex: 1 }}>
            <Input
              label={t("form.city")}
              value={state.city}
              onChange={(v) => setState({ city: v })}
              placeholder={t("form.cityPlaceholder")}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label={t("form.provinceRegion")}
              value={state.province_region}
              onChange={(v) => setState({ province_region: v })}
              placeholder={t("form.provinceRegionPlaceholder")}
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: Space.sm }}>
          <View style={{ flex: 1 }}>
            <Input
              label={t("form.postalCode")}
              value={state.postal_code}
              onChange={(v) => setState({ postal_code: v })}
              placeholder="A1A 1A1"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label={t("form.country")}
              value={state.country}
              onChange={(v) => setState({ country: v })}
              placeholder="Canada"
            />
          </View>
        </View>
      </Section>

      {/* ── Preferences (communication tone, property interest, timeframe) ── */}
      <Section title={t("form.sections.preferences")}>
        <PillRow
          label={t("form.communicationTone")}
          value={state.communication_tone}
          options={COMMUNICATION_TONE_OPTIONS}
          optionLabel={(o) => t(`form.communicationToneOptions.${o}`)}
          onChange={(v) => setState({ communication_tone: v })}
        />
        <PillRow
          label={t("form.propertyInterestType")}
          value={state.property_interest_type}
          options={PROPERTY_INTEREST_TYPE_OPTIONS}
          optionLabel={(o) => t(`form.propertyInterestTypeOptions.${o}`)}
          onChange={(v) => setState({ property_interest_type: v })}
        />
        <Input
          label={t("form.propertyInterest")}
          value={state.property_interest}
          onChange={(v) => setState({ property_interest: v })}
          placeholder={t("form.propertyInterestPlaceholder")}
          keyboardType="numeric"
        />
        <PillRow
          label={t("form.timeframe")}
          value={state.timeframe || "unknown"}
          options={TIMEFRAME_OPTIONS}
          optionLabel={(o) => t(`form.timeframeOptions.${o}`)}
          onChange={(v) => setState({ timeframe: v === "unknown" ? "" : v })}
        />
      </Section>

      {/* ── Buyer profile ── */}
      <Section title={t("form.sections.buyer")}>
        <PillRow
          label={t("form.buyerPreApproved")}
          value={
            state.buyer_pre_approved === true
              ? "yes"
              : state.buyer_pre_approved === false
                ? "no"
                : "unknown"
          }
          options={["unknown", "yes", "no"] as const}
          optionLabel={(o) => t(`form.buyerPreApprovedOptions.${o}`)}
          onChange={(v) =>
            setState({
              buyer_pre_approved: v === "yes" ? true : v === "no" ? false : null,
            })
          }
        />
        <Input
          label={t("form.buyerPreApprovalAmount")}
          value={state.buyer_pre_approval_amount}
          onChange={(v) => setState({ buyer_pre_approval_amount: v })}
          placeholder="500000"
          keyboardType="numeric"
        />
        <PillRow
          label={t("form.buyerFinancingType")}
          value={state.buyer_financing_type || "unknown"}
          options={BUYER_FINANCING_OPTIONS}
          optionLabel={(o) => t(`form.buyerFinancingOptions.${o}`)}
          onChange={(v) =>
            setState({ buyer_financing_type: v === "unknown" ? "" : v })
          }
        />
        <Input
          label={t("form.buyerTargetCloseDate")}
          value={state.buyer_target_close_date}
          onChange={(v) => setState({ buyer_target_close_date: v })}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
        />
        <Input
          label={t("form.buyerTargetArea")}
          value={state.buyer_target_area}
          onChange={(v) => setState({ buyer_target_area: v })}
          placeholder={t("form.buyerTargetAreaPlaceholder")}
        />
      </Section>

      {/* ── Notes ── */}
      <Section title={t("form.sections.notes")}>
        <Input
          label={t("form.notes")}
          value={state.notes}
          onChange={(v) => setState({ notes: v })}
          placeholder={t("form.notesPlaceholder")}
          multiline
        />
      </Section>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert form state to the partial Client payload that addClient /
 * updateClient expects. Numeric fields are parsed; empty strings become
 * `null`. Caller passes the result as `addClient({ name, status, tags,
 * ...buildClientPayload(state) })`.
 */
export function buildClientPayload(state: ClientFormState) {
  const parseNum = (s: string): number | null => {
    const cleaned = s.replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());

  return {
    first_name: orNull(state.first_name),
    last_name: orNull(state.last_name),
    email: orNull(state.email),
    phone: orNull(state.phone),
    phone_type: state.phone_type,
    secondary_email: orNull(state.secondary_email),
    secondary_phone: orNull(state.secondary_phone),
    secondary_phone_type: state.secondary_phone_type,
    preferred_contact: state.preferred_contact,
    communication_tone: state.communication_tone,
    lead_source: orNull(state.lead_source),
    notes: orNull(state.notes),
    birthdate: orNull(state.birthdate),

    street_address: orNull(state.street_address),
    unit_number: orNull(state.unit_number),
    city: orNull(state.city),
    province_region: orNull(state.province_region),
    postal_code: orNull(state.postal_code),
    country: state.country.trim() || "Canada",

    property_interest: parseNum(state.property_interest),
    property_interest_type: state.property_interest_type,
    timeframe: state.timeframe === "" ? null : state.timeframe,

    buyer_pre_approved: state.buyer_pre_approved,
    buyer_pre_approval_amount: parseNum(state.buyer_pre_approval_amount),
    buyer_financing_type:
      state.buyer_financing_type === "" ? null : state.buyer_financing_type,
    buyer_target_close_date: orNull(state.buyer_target_close_date),
    buyer_target_area: orNull(state.buyer_target_area),
  };
}

/** Inverse of buildClientPayload — populate the form from an existing Client. */
export function clientToFormState(client: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  phone_type: ClientFormState["phone_type"];
  secondary_email: string | null;
  secondary_phone: string | null;
  secondary_phone_type: ClientFormState["secondary_phone_type"];
  preferred_contact: ClientFormState["preferred_contact"];
  communication_tone: ClientFormState["communication_tone"];
  lead_source: string | null;
  notes: string | null;
  birthdate: string | null;
  street_address: string | null;
  unit_number: string | null;
  city: string | null;
  province_region: string | null;
  postal_code: string | null;
  country: string;
  property_interest: number | null;
  property_interest_type: ClientFormState["property_interest_type"];
  timeframe: string | null;
  buyer_pre_approved: boolean | null;
  buyer_pre_approval_amount: number | null;
  buyer_financing_type: string | null;
  buyer_target_close_date: string | null;
  buyer_target_area: string | null;
}): ClientFormState {
  const safeTimeframe = (TIMEFRAME_OPTIONS as readonly string[]).includes(
    client.timeframe ?? "",
  )
    ? (client.timeframe as ClientFormState["timeframe"])
    : "";
  const safeFinancing = (BUYER_FINANCING_OPTIONS as readonly string[]).includes(
    client.buyer_financing_type ?? "",
  )
    ? (client.buyer_financing_type as ClientFormState["buyer_financing_type"])
    : "";
  return {
    first_name: client.first_name ?? "",
    last_name: client.last_name ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    phone_type: client.phone_type ?? "mobile",
    secondary_email: client.secondary_email ?? "",
    secondary_phone: client.secondary_phone ?? "",
    secondary_phone_type: client.secondary_phone_type ?? "mobile",
    preferred_contact: client.preferred_contact ?? "phone",
    communication_tone: client.communication_tone ?? "friendly",
    lead_source: client.lead_source ?? "",
    notes: client.notes ?? "",
    birthdate: client.birthdate ?? "",
    street_address: client.street_address ?? "",
    unit_number: client.unit_number ?? "",
    city: client.city ?? "",
    province_region: client.province_region ?? "",
    postal_code: client.postal_code ?? "",
    country: client.country || "Canada",
    property_interest:
      client.property_interest != null ? String(client.property_interest) : "",
    property_interest_type: client.property_interest_type ?? "budget",
    timeframe: safeTimeframe,
    buyer_pre_approved: client.buyer_pre_approved,
    buyer_pre_approval_amount:
      client.buyer_pre_approval_amount != null
        ? String(client.buyer_pre_approval_amount)
        : "",
    buyer_financing_type: safeFinancing,
    buyer_target_close_date: client.buyer_target_close_date ?? "",
    buyer_target_area: client.buyer_target_area ?? "",
  };
}
