import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
  AppState,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Phone,
  MessageSquare,
  Mail,
  Plus,
  X,
  Users,
  ChevronRight,
} from "lucide-react-native";
import { useDataStore, type Client } from "@/stores/data-store";
import { C, STATUS_COLORS, getInitials } from "@/lib/theme";

type Filter = "all" | "active" | "landed";

const ACTIVE_STATUSES = new Set(["boarding", "taxiing", "approach", "in_flight"]);

const STATUS_LABELS: Record<string, string> = {
  boarding:  "Boarding",
  taxiing:   "Taxiing",
  approach:  "Approach",
  in_flight: "In Flight",
  landed:    "Landed",
  cruising:  "Cruising",
};

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function ClientsScreen() {
  const { clients, fetchClients, addClient, addActivity } = useDataStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [pendingContact, setPendingContact] = useState<{
    clientId: string;
    clientName: string;
    type: "call" | "text";
  } | null>(null);

  useEffect(() => {
    if (clients.length === 0) fetchClients();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && pendingContact) {
        Alert.alert(
          "Log Activity?",
          `Did you complete the ${pendingContact.type} to ${pendingContact.clientName}?`,
          [
            { text: "No", style: "cancel", onPress: () => setPendingContact(null) },
            {
              text: "Yes, log it",
              onPress: async () => {
                await addActivity({
                  client_id: pendingContact.clientId,
                  type: pendingContact.type,
                  description: `${pendingContact.type === "call" ? "Phone call" : "Text message"} initiated from app`,
                  activity_date: new Date().toISOString(),
                });
                setPendingContact(null);
                fetchClients();
              },
            },
          ]
        );
      }
    });
    return () => sub.remove();
  }, [pendingContact]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchClients();
    setRefreshing(false);
  };

  const handleCall = useCallback((client: Client) => {
    if (!client.phone) {
      Alert.alert("No phone number", "Add a phone number for this client first.");
      return;
    }
    setPendingContact({ clientId: client.id, clientName: client.name, type: "call" });
    Linking.openURL(`tel:${client.phone}`);
  }, []);

  const handleText = useCallback((client: Client) => {
    if (!client.phone) {
      Alert.alert("No phone number", "Add a phone number for this client first.");
      return;
    }
    setPendingContact({ clientId: client.id, clientName: client.name, type: "text" });
    Linking.openURL(`sms:${client.phone}`);
  }, []);

  const handleEmail = useCallback((client: Client) => {
    if (!client.email) {
      Alert.alert("No email", "Add an email for this client first.");
      return;
    }
    Linking.openURL(`mailto:${client.email}`);
  }, []);

  const active = clients.filter((c) => ACTIVE_STATUSES.has(c.status));
  const landed = clients.filter(
    (c) => c.status === "landed" || c.status === "cruising"
  );
  const filtered =
    filter === "active" ? active : filter === "landed" ? landed : clients;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── Header ── */}
      <View
        style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={S.screenTitle}>Clients</Text>
          <Pressable onPress={() => setShowAdd(true)} style={S.addBtn}>
            <Plus size={16} color="#fff" strokeWidth={2.5} />
            <Text style={S.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {/* Summary chips */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          <SummaryChip label="Total" value={clients.length} color={C.text} />
          <SummaryChip label="Active" value={active.length} color={C.primary} />
          <SummaryChip label="Landed" value={landed.length} color={C.textDim} />
          <SummaryChip
            label="Overdue"
            value={
              clients.filter((c) => {
                if (!c.last_contact_at) return true;
                return (
                  (Date.now() - new Date(c.last_contact_at).getTime()) /
                    86400000 >
                  30
                );
              }).length
            }
            color={C.danger}
          />
        </View>

        {/* Filter tabs */}
        <View style={S.tabs}>
          {(
            [
              { key: "all", label: "All", count: clients.length },
              { key: "active", label: "Active", count: active.length },
              { key: "landed", label: "Landed", count: landed.length },
            ] as { key: Filter; label: string; count: number }[]
          ).map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[S.tab, filter === f.key && S.tabActive]}
            >
              <Text
                style={[S.tabText, filter === f.key && S.tabTextActive]}
              >
                {f.label}
              </Text>
              {f.count > 0 && (
                <View
                  style={[
                    S.tabBadge,
                    {
                      backgroundColor:
                        filter === f.key ? C.primary : C.textFaint,
                    },
                  ]}
                >
                  <Text style={S.tabBadgeText}>{f.count}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 12, gap: 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
          />
        }
      >
        {filtered.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 56, gap: 12 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: C.cardBorder,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Users size={32} color={C.primary} />
            </View>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: "700" }}>
              No clients found
            </Text>
            <Text
              style={{ color: C.textDim, fontSize: 13, textAlign: "center" }}
            >
              Add your first client to start tracking
            </Text>
          </View>
        ) : (
          filtered.map((c) => (
            <Pressable key={c.id} onPress={() => setSelectedClient(c)}>
              <ClientRow client={c} />
            </Pressable>
          ))
        )}
      </ScrollView>

      {selectedClient && (
        <ClientDetailSheet
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onCall={handleCall}
          onText={handleText}
          onEmail={handleEmail}
        />
      )}

      <AddClientModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={async (c) => {
          const ok = await addClient(c);
          if (ok) setShowAdd(false);
          return ok;
        }}
      />
    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.card,
        borderRadius: 10,
        paddingVertical: 9,
        alignItems: "center",
        borderWidth: 1,
        borderColor: C.cardBorder,
      }}
    >
      <Text
        style={{ color, fontSize: 17, fontWeight: "800", letterSpacing: -0.3 }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: C.textDim,
          fontSize: 10,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function ClientRow({ client }: { client: Client }) {
  const statusColor = STATUS_COLORS[client.status] ?? C.textDim;
  const statusLabel = STATUS_LABELS[client.status] ?? client.status;
  const initials = getInitials(client.name);
  const daysSince = client.last_contact_at
    ? Math.floor(
        (Date.now() - new Date(client.last_contact_at).getTime()) / 86400000
      )
    : null;
  const isOverdue = daysSince === null || daysSince > 30;

  return (
    <View style={S.card}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
        }}
      >
        {/* Avatar */}
        <View
          style={[
            S.avatar,
            { backgroundColor: statusColor + "22", borderColor: statusColor + "44" },
          ]}
        >
          <Text style={[S.avatarText, { color: statusColor }]}>{initials}</Text>
        </View>

        {/* Info */}
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            style={{ color: C.text, fontSize: 15, fontWeight: "700" }}
            numberOfLines={1}
          >
            {client.name}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {client.email && (
              <Text
                style={{ color: C.textDim, fontSize: 12 }}
                numberOfLines={1}
              >
                {client.email}
              </Text>
            )}
          </View>
        </View>

        {/* Right side */}
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          <View
            style={{
              backgroundColor: statusColor + "20",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
            }}
          >
            <Text
              style={{ color: statusColor, fontSize: 10, fontWeight: "700" }}
            >
              {statusLabel}
            </Text>
          </View>
          {daysSince !== null ? (
            <Text
              style={{
                color: isOverdue ? C.danger : C.textDim,
                fontSize: 11,
                fontWeight: isOverdue ? "600" : "400",
              }}
            >
              {daysSince === 0 ? "Today" : `${daysSince}d ago`}
            </Text>
          ) : (
            <Text style={{ color: C.danger, fontSize: 11, fontWeight: "600" }}>
              Never contacted
            </Text>
          )}
        </View>

        <ChevronRight size={14} color={C.textFaint} />
      </View>
    </View>
  );
}

function ClientDetailSheet({
  client,
  onClose,
  onCall,
  onText,
  onEmail,
}: {
  client: Client;
  onClose: () => void;
  onCall: (c: Client) => void;
  onText: (c: Client) => void;
  onEmail: (c: Client) => void;
}) {
  const statusColor = STATUS_COLORS[client.status] ?? C.textDim;
  const initials = getInitials(client.name);

  return (
    <Modal visible animationType="slide" transparent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={S.sheet}>
          <View style={S.sheetHandle} />

          {/* Client header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              marginBottom: 20,
            }}
          >
            <View
              style={[
                S.avatarLarge,
                {
                  backgroundColor: statusColor + "22",
                  borderColor: statusColor + "50",
                },
              ]}
            >
              <Text style={[S.avatarLargeText, { color: statusColor }]}>
                {initials}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: C.text, fontSize: 20, fontWeight: "800" }}
              >
                {client.name}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <View
                  style={{
                    backgroundColor: statusColor + "20",
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{
                      color: statusColor,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {STATUS_LABELS[client.status] ?? client.status}
                  </Text>
                </View>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: C.cardBorder,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={14} color={C.textMuted} />
            </Pressable>
          </View>

          {/* Contact info */}
          {(client.email || client.phone) && (
            <View
              style={[
                S.card,
                { padding: 14, gap: 8, marginBottom: 16 },
              ]}
            >
              {client.email && (
                <Text style={{ color: C.textMuted, fontSize: 14 }}>
                  {client.email}
                </Text>
              )}
              {client.phone && (
                <Text style={{ color: C.textMuted, fontSize: 14 }}>
                  {client.phone}
                </Text>
              )}
            </View>
          )}

          {/* Action buttons */}
          <View
            style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}
          >
            <ActionButton
              icon={<Phone size={18} color={C.success} />}
              label="Call"
              color={C.success}
              onPress={() => onCall(client)}
            />
            <ActionButton
              icon={<MessageSquare size={18} color={C.blue} />}
              label="Text"
              color={C.blue}
              onPress={() => onText(client)}
            />
            <ActionButton
              icon={<Mail size={18} color={C.purple} />}
              label="Email"
              color={C.purple}
              onPress={() => onEmail(client)}
            />
          </View>

          {/* Tags */}
          {client.tags.length > 0 && (
            <View
              style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}
            >
              {client.tags.map((t) => (
                <View
                  key={t}
                  style={{
                    backgroundColor: C.card,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: C.cardBorder,
                  }}
                >
                  <Text style={{ color: C.textMuted, fontSize: 12 }}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Notes */}
          {client.notes && (
            <View
              style={[
                S.card,
                { padding: 12, marginTop: 12 },
              ]}
            >
              <Text style={{ color: C.textDim, fontSize: 13, lineHeight: 18 }}>
                {client.notes}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: color + "18",
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderColor: color + "30",
      }}
    >
      {icon}
      <Text style={{ color, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

// ── Add Client Modal ─────────────────────────────────────────────────────────

function AddClientModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (c: Omit<Client, "id" | "created_at">) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const ok = await onAdd({
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      status: "boarding",
      tags: [],
      lead_source: null,
      last_contact_at: null,
      notes: null,
    });
    setSaving(false);
    if (ok) {
      setName("");
      setEmail("");
      setPhone("");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <View style={S.sheet}>
          <View style={S.sheetHandle} />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <Text style={S.sheetTitle}>Add Client</Text>
            <Pressable
              onPress={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: C.cardBorder,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={14} color={C.textMuted} />
            </Pressable>
          </View>
          <Field
            label="Full Name"
            value={name}
            onChange={setName}
            placeholder="Jane Smith"
          />
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="jane@example.com"
          />
          <Field
            label="Phone"
            value={phone}
            onChange={setPhone}
            placeholder="+1 (555) 123-4567"
          />
          <Pressable
            onPress={handleSubmit}
            disabled={saving || !name.trim()}
            style={[
              S.primaryBtn,
              { opacity: saving || !name.trim() ? 0.6 : 1 },
            ]}
          >
            <Text style={S.primaryBtnText}>
              {saving ? "Adding…" : "Add Client"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={S.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.textFaint}
        style={S.input}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  screenTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.8,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  tabs: {
    flexDirection: "row",
    gap: 6,
    marginTop: 14,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  tabActive: {
    backgroundColor: C.primaryDim,
    borderColor: C.primaryBorder,
  },
  tabText: {
    color: C.textDim,
    fontSize: 12,
    fontWeight: "700",
  },
  tabTextActive: {
    color: C.primary,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: "hidden",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "800",
  },
  avatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  avatarLargeText: {
    fontSize: 20,
    fontWeight: "800",
  },
  sheet: {
    backgroundColor: "#13131E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.cardBorder,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.textFaint,
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.3,
  },
  fieldLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 14,
    color: C.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  primaryBtn: {
    backgroundColor: C.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
