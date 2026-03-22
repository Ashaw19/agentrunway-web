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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDataStore, type Client } from "@/stores/data-store";

const STATUS_COLORS: Record<string, string> = {
  boarding: "#3B82F6",
  taxiing: "#8B5CF6",
  approach: "#F59E0B",
  in_flight: "#10B981",
  landed: "#6B7280",
  cruising: "#06B6D4",
};

type Filter = "all" | "active" | "landed";

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

  // Smart contact logging: detect app resume after call/text
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && pendingContact) {
        Alert.alert(
          "Log Activity?",
          `Did you complete the ${pendingContact.type} to ${pendingContact.clientName}?`,
          [
            {
              text: "No",
              style: "cancel",
              onPress: () => setPendingContact(null),
            },
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
                fetchClients(); // refresh last_contact_at
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

  const handleCall = useCallback(
    (client: Client) => {
      if (!client.phone) {
        Alert.alert("No phone number", "Add a phone number for this client first.");
        return;
      }
      setPendingContact({ clientId: client.id, clientName: client.name, type: "call" });
      Linking.openURL(`tel:${client.phone}`);
    },
    []
  );

  const handleText = useCallback(
    (client: Client) => {
      if (!client.phone) {
        Alert.alert("No phone number", "Add a phone number for this client first.");
        return;
      }
      setPendingContact({ clientId: client.id, clientName: client.name, type: "text" });
      Linking.openURL(`sms:${client.phone}`);
    },
    []
  );

  const handleEmail = useCallback((client: Client) => {
    if (!client.email) {
      Alert.alert("No email", "Add an email for this client first.");
      return;
    }
    Linking.openURL(`mailto:${client.email}`);
  }, []);

  const activeStatuses = new Set(["boarding", "taxiing", "approach", "in_flight"]);
  const filtered =
    filter === "active"
      ? clients.filter((c) => activeStatuses.has(c.status))
      : filter === "landed"
        ? clients.filter((c) => c.status === "landed" || c.status === "cruising")
        : clients;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0A0A0F" }}>
      <View style={{ padding: 20, paddingBottom: 0 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.5 }}>
            Clients
          </Text>
          <Pressable
            onPress={() => setShowAdd(true)}
            style={{ backgroundColor: "#6366F1", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>+ Add</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: 4, marginTop: 16 }}>
          {(["all", "active", "landed"] as Filter[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: filter === f ? "#6366F1" : "#1A1A2E",
                alignItems: "center",
              }}
            >
              <Text style={{ color: filter === f ? "#FFFFFF" : "#9CA3AF", fontSize: 12, fontWeight: "700", textTransform: "capitalize" }}>
                {f} ({f === "all" ? clients.length : f === "active" ? clients.filter((c) => activeStatuses.has(c.status)).length : clients.filter((c) => c.status === "landed" || c.status === "cruising").length})
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
      >
        {filtered.length === 0 ? (
          <Text style={{ color: "#6B7280", textAlign: "center", marginTop: 40, fontSize: 14 }}>
            No clients found.
          </Text>
        ) : (
          filtered.map((c) => (
            <Pressable key={c.id} onPress={() => setSelectedClient(c)}>
              <ClientRow client={c} />
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Client Detail Sheet */}
      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onCall={handleCall}
          onText={handleText}
          onEmail={handleEmail}
        />
      )}

      {/* Add Client Modal */}
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

function ClientRow({ client }: { client: Client }) {
  const statusColor = STATUS_COLORS[client.status] ?? "#6B7280";
  const daysSinceContact = client.last_contact_at
    ? Math.floor((Date.now() - new Date(client.last_contact_at).getTime()) / 86400000)
    : null;

  return (
    <View style={{ backgroundColor: "#1A1A2E", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#2D2D44" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {client.name}
        </Text>
        <View style={{ backgroundColor: statusColor + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
          <Text style={{ color: statusColor, fontSize: 10, fontWeight: "700", textTransform: "capitalize" }}>
            {client.status.replace("_", " ")}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
        {client.email && <Text style={{ color: "#6B7280", fontSize: 11 }}>{client.email}</Text>}
        {daysSinceContact !== null && (
          <Text style={{ color: daysSinceContact > 30 ? "#EF4444" : "#6B7280", fontSize: 11 }}>
            {daysSinceContact === 0 ? "Today" : `${daysSinceContact}d ago`}
          </Text>
        )}
      </View>
    </View>
  );
}

function ClientDetailModal({
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
  return (
    <Modal visible animationType="slide" transparent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: "#1A1A2E", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "700" }}>{client.name}</Text>
            <Pressable onPress={onClose}>
              <Text style={{ color: "#6366F1", fontSize: 14, fontWeight: "600" }}>Close</Text>
            </Pressable>
          </View>

          {client.email && <Text style={{ color: "#9CA3AF", fontSize: 14 }}>{client.email}</Text>}
          {client.phone && <Text style={{ color: "#9CA3AF", fontSize: 14 }}>{client.phone}</Text>}

          {/* Action buttons */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <ActionButton label="Call" color="#10B981" onPress={() => onCall(client)} />
            <ActionButton label="Text" color="#3B82F6" onPress={() => onText(client)} />
            <ActionButton label="Email" color="#8B5CF6" onPress={() => onEmail(client)} />
          </View>

          {client.notes && (
            <View style={{ backgroundColor: "#0A0A0F", borderRadius: 8, padding: 12 }}>
              <Text style={{ color: "#9CA3AF", fontSize: 12 }}>{client.notes}</Text>
            </View>
          )}

          {client.tags.length > 0 && (
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {client.tags.map((t) => (
                <View key={t} style={{ backgroundColor: "#2D2D44", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                  <Text style={{ color: "#9CA3AF", fontSize: 11 }}>{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ActionButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, backgroundColor: color + "20", paddingVertical: 12, borderRadius: 10, alignItems: "center" }}
    >
      <Text style={{ color, fontSize: 14, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

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
    if (ok) { setName(""); setEmail(""); setPhone(""); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#1A1A2E", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>Add Client</Text>
            <Pressable onPress={onClose}>
              <Text style={{ color: "#6366F1", fontSize: 14, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
          <Field label="Name" value={name} onChange={setName} placeholder="Jane Smith" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="jane@example.com" keyboardType="default" />
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 (555) 123-4567" keyboardType="default" />
          <Pressable onPress={handleSubmit} disabled={saving || !name.trim()} style={{ backgroundColor: "#6366F1", paddingVertical: 14, borderRadius: 10, alignItems: "center", opacity: saving || !name.trim() ? 0.6 : 1 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>{saving ? "Saving..." : "Add Client"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; keyboardType?: "numeric" | "default" }) {
  return (
    <View>
      <Text style={{ color: "#9CA3AF", fontSize: 12, fontWeight: "600", marginBottom: 4 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#4B5563" keyboardType={keyboardType ?? "default"} style={{ backgroundColor: "#0A0A0F", borderRadius: 8, padding: 12, color: "#FFFFFF", fontSize: 15, borderWidth: 1, borderColor: "#2D2D44" }} />
    </View>
  );
}
