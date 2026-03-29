/**
 * Clients Screen — Premium, theme-aware client management.
 *
 * Features: real-time search, filter tabs, detail sheet with
 * call/text/email actions, contact activity logging via AppState,
 * post-contact bottom sheet with notes, inline call buttons,
 * and add-client modal.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  Linking,
  Alert,
  AppState,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Phone,
  MessageSquare,
  Mail,
  Plus,
  Search,
  ChevronRight,
  Clock,
  UserPlus,
  TrendingUp,
  X,
} from "lucide-react-native";
import {
  useDataStore,
  type Client,
  type ContactActivity,
  type PipelineDeal,
  type Transaction,
  type SmartListCounts,
} from "@/stores/data-store";
import {
  useColors,
  useTheme,
  shadows,
  Space,
  Radius,
  Type,
  STATUS_COLORS,
  StatusColors,
  STAGE_COLORS,
  getInitials,
  fmtCurrency,
} from "@/lib/theme";
import { Card, Sheet, Badge, Avatar, Button, Input, EmptyState } from "@/components/ui";
import { Skeleton } from "@/components/ui/Skeleton";

// ── Constants ─────────────────────────────────────────────────────────────────

type Filter = "all" | "active" | "landed";

type ContactType = "call" | "text" | "email";
type ActivityType = "call" | "text" | "meeting" | "showing" | "note";

const ACTIVE_STATUSES = new Set(["boarding", "taxiing", "approach", "in_flight"]);

const STATUS_LABELS: Record<string, string> = {
  boarding:  "Boarding",
  taxiing:   "Taxiing",
  approach:  "Approach",
  in_flight: "In Flight",
  landed:    "Landed",
  cruising:  "Cruising",
};

const CONTACT_TYPE_TITLES: Record<ContactType, string> = {
  call:  "Log Call",
  text:  "Log Text",
  email: "Log Email",
};

const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call:    "Call",
  text:    "Text",
  meeting: "Meeting",
  showing: "Showing",
  note:    "Note",
};

const ACTIVITY_TYPE_ICONS: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  call:    "call",
  text:    "chatbubble-ellipses",
  meeting: "people",
  showing: "home",
  note:    "document-text",
};

// ── Clients Skeleton ────────────────────────────────────────────────────────

function ClientsSkeleton() {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingHorizontal: Space.xl, paddingTop: Space.xl }}>
      {/* Header row */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width={100} height={28} borderRadius={Radius.sm} />
        <Skeleton width={72} height={40} borderRadius={Radius.md} />
      </View>
      {/* Search bar */}
      <Skeleton width="100%" height={48} borderRadius={Radius.md} style={{ marginTop: Space.lg }} />
      {/* Filter tabs */}
      <View style={{ flexDirection: "row", gap: Space.sm, marginTop: Space.lg, marginBottom: Space.lg }}>
        <Skeleton width={0} height={44} borderRadius={Radius.md} style={{ flex: 1 }} />
        <Skeleton width={0} height={44} borderRadius={Radius.md} style={{ flex: 1 }} />
        <Skeleton width={0} height={44} borderRadius={Radius.md} style={{ flex: 1 }} />
      </View>
      {/* Client row skeletons */}
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: Space.md,
            gap: Space.md,
          }}
        >
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={{ flex: 1, gap: Space.xs }}>
            <Skeleton width={160} height={16} borderRadius={Radius.sm} />
            <Skeleton width={120} height={12} borderRadius={Radius.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function ClientsScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const s = shadows(mode);
  const router = useRouter();

  const {
    clients, fetchClients, addClient, addActivity, updateClient, isLoading,
    smartListCounts, overdueFollowupClients, uncontactedLeadClients,
  } = useDataStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [smartFilter, setSmartFilter] = useState<"overdue" | "uncontacted" | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [pendingContact, setPendingContact] = useState<{
    clientId: string;
    clientName: string;
    type: ContactType;
  } | null>(null);
  const [showPostContact, setShowPostContact] = useState(false);

  useEffect(() => {
    if (clients.length === 0) fetchClients();
  }, []);

  // ── AppState listener: show post-contact sheet after returning from phone/sms/email ──

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && pendingContact) {
        setShowPostContact(true);
      }
    });
    return () => sub.remove();
  }, [pendingContact]);

  // ── Actions ───────────────────────────────────────────────────────────────

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
    setPendingContact({ clientId: client.id, clientName: client.name, type: "email" });
    Linking.openURL(`mailto:${client.email}`);
  }, []);

  const handlePostContactLog = useCallback(
    async (activityType: ActivityType, notes: string) => {
      if (!pendingContact) return;
      await addActivity({
        client_id: pendingContact.clientId,
        type: activityType,
        description: notes.trim() || null,
        activity_date: new Date().toISOString(),
      });
      setPendingContact(null);
      setShowPostContact(false);
      fetchClients();
    },
    [pendingContact, addActivity, fetchClients]
  );

  const handlePostContactSkip = useCallback(() => {
    setPendingContact(null);
    setShowPostContact(false);
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────

  const active = useMemo(() => clients.filter((cl) => ACTIVE_STATUSES.has(cl.status)), [clients]);
  const landed = useMemo(
    () => clients.filter((cl) => cl.status === "landed" || cl.status === "cruising"),
    [clients]
  );

  const slCounts = useMemo(() => smartListCounts(), [clients]);

  const filtered = useMemo(() => {
    // Smart filter takes precedence
    if (smartFilter === "overdue") {
      let list = overdueFollowupClients();
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (cl) =>
            cl.name.toLowerCase().includes(q) ||
            (cl.email && cl.email.toLowerCase().includes(q)) ||
            (cl.phone && cl.phone.toLowerCase().includes(q))
        );
      }
      return list;
    }
    if (smartFilter === "uncontacted") {
      let list = uncontactedLeadClients();
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (cl) =>
            cl.name.toLowerCase().includes(q) ||
            (cl.email && cl.email.toLowerCase().includes(q)) ||
            (cl.phone && cl.phone.toLowerCase().includes(q))
        );
      }
      return list;
    }

    let list =
      filter === "active" ? active : filter === "landed" ? landed : clients;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (cl) =>
          cl.name.toLowerCase().includes(q) ||
          (cl.email && cl.email.toLowerCase().includes(q)) ||
          (cl.phone && cl.phone.toLowerCase().includes(q))
      );
    }

    return list;
  }, [clients, active, landed, filter, search, smartFilter]);

  // ── Filter tab definitions ────────────────────────────────────────────────

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: clients.length },
    { key: "active", label: "Active", count: active.length },
    { key: "landed", label: "Landed", count: landed.length },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Loading Skeleton */}
      {isLoading && clients.length === 0 && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: c.bg }]}>
          <ClientsSkeleton />
        </View>
      )}

      {/* ── Header ── */}
      <View style={{ paddingHorizontal: Space.xl, paddingTop: Space.xl, paddingBottom: Space.xs }}>
        <View style={styles.headerRow}>
          <Text style={[Type.h1, { color: c.text }]}>Clients</Text>
          <Button
            label="Add"
            variant="primary"
            icon="add"
            onPress={() => setShowAdd(true)}
          />
        </View>

        {/* ── Search Bar ── */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: c.card,
              borderColor: c.cardBorder,
              ...s.card,
            },
          ]}
        >
          <Search size={18} color={c.textDim} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, email, or phone..."
            placeholderTextColor={c.textDim}
            style={[Type.body, styles.searchInput, { color: c.text }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={Space.sm}>
              <Ionicons name="close-circle" size={20} color={c.textDim} />
            </Pressable>
          )}
        </View>

        {/* ── Smart Lists ── */}
        {(slCounts.overdueFollowups > 0 || slCounts.uncontactedLeads > 0 || slCounts.hotPipeline > 0) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: Space.md, marginBottom: Space.xs }}
            contentContainerStyle={{ gap: Space.sm }}
          >
            {slCounts.overdueFollowups > 0 && (
              <Pressable
                onPress={() => {
                  setSmartFilter(smartFilter === "overdue" ? null : "overdue");
                  setFilter("all");
                }}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: Space.md,
                    paddingVertical: Space.sm,
                    borderRadius: Radius.pill,
                    gap: 6,
                    backgroundColor:
                      smartFilter === "overdue"
                        ? "#EF4444" + "20"
                        : c.card,
                    borderWidth: 1,
                    borderColor:
                      smartFilter === "overdue"
                        ? "#EF4444" + "40"
                        : c.cardBorder,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Clock size={13} color="#EF4444" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#EF4444" }}>
                  {slCounts.overdueFollowups} Overdue
                </Text>
                {smartFilter === "overdue" && (
                  <X size={12} color="#EF4444" />
                )}
              </Pressable>
            )}
            {slCounts.uncontactedLeads > 0 && (
              <Pressable
                onPress={() => {
                  setSmartFilter(smartFilter === "uncontacted" ? null : "uncontacted");
                  setFilter("all");
                }}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: Space.md,
                    paddingVertical: Space.sm,
                    borderRadius: Radius.pill,
                    gap: 6,
                    backgroundColor:
                      smartFilter === "uncontacted"
                        ? "#F59E0B" + "20"
                        : c.card,
                    borderWidth: 1,
                    borderColor:
                      smartFilter === "uncontacted"
                        ? "#F59E0B" + "40"
                        : c.cardBorder,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <UserPlus size={13} color="#F59E0B" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#F59E0B" }}>
                  {slCounts.uncontactedLeads} New Leads
                </Text>
                {smartFilter === "uncontacted" && (
                  <X size={12} color="#F59E0B" />
                )}
              </Pressable>
            )}
            {slCounts.hotPipeline > 0 && (
              <Pressable
                onPress={() => router.push("/deals")}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: Space.md,
                    paddingVertical: Space.sm,
                    borderRadius: Radius.pill,
                    gap: 6,
                    backgroundColor: c.card,
                    borderWidth: 1,
                    borderColor: c.cardBorder,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <TrendingUp size={13} color="#10B981" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#10B981" }}>
                  {slCounts.hotPipeline} Hot Deals
                </Text>
              </Pressable>
            )}
          </ScrollView>
        )}

        {/* ── Filter Tabs ── */}
        <View style={styles.tabs}>
          {tabs.map((f) => {
            const isActive = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => { setFilter(f.key); setSmartFilter(null); }}
                style={[
                  styles.tab,
                  {
                    backgroundColor: isActive ? c.primaryDim : c.card,
                    borderColor: isActive ? c.primaryBorder : c.cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    Type.caption,
                    { color: isActive ? c.primary : c.textDim, fontWeight: "700" },
                  ]}
                >
                  {f.label}
                </Text>
                {f.count > 0 && (
                  <View
                    style={[
                      styles.tabBadge,
                      {
                        backgroundColor: isActive ? c.primary : c.textFaint,
                      },
                    ]}
                  >
                    <Text style={[Type.micro, { color: "#FFFFFF" }]}>{f.count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Client List ── */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Space.xl,
          paddingTop: Space.md,
          paddingBottom: 120,
          gap: Space.sm,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.primary}
          />
        }
      >
        {filtered.length === 0 ? (
          search.trim() ? (
            <EmptyState
              icon="search-outline"
              title="No matches"
              subtitle={`No clients match "${search.trim()}"`}
            />
          ) : (
            <EmptyState
              icon="people-outline"
              title="No clients found"
              subtitle="Add your first client to start tracking"
              actionLabel="Add Client"
              onAction={() => setShowAdd(true)}
            />
          )
        ) : (
          filtered.map((cl) => (
            <ClientRow
              key={cl.id}
              client={cl}
              onPress={() => setSelectedClient(cl)}
              onCall={handleCall}
            />
          ))
        )}
      </ScrollView>

      {/* ── Client Detail Sheet ── */}
      {selectedClient && (
        <ClientDetailSheet
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onCall={handleCall}
          onText={handleText}
          onEmail={handleEmail}
          onUpdate={async (updates) => {
            const ok = await updateClient(selectedClient.id, updates);
            if (ok) {
              // Update the selected client reference with new values
              setSelectedClient((prev) => prev ? { ...prev, ...updates } : null);
            }
            return ok;
          }}
        />
      )}

      {/* ── Post-Contact Logging Sheet ── */}
      {showPostContact && pendingContact && (
        <PostContactSheet
          contactType={pendingContact.type}
          clientName={pendingContact.clientName}
          onLog={handlePostContactLog}
          onSkip={handlePostContactSkip}
        />
      )}

      {/* ── Add Client Sheet ── */}
      <AddClientSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={async (cl) => {
          const ok = await addClient(cl);
          if (ok) setShowAdd(false);
          return ok;
        }}
      />
    </SafeAreaView>
  );
}

// ── Client Row ──────────────────────────────────────────────────────────────

function ClientRow({
  client,
  onPress,
  onCall,
}: {
  client: Client;
  onPress: () => void;
  onCall: (c: Client) => void;
}) {
  const c = useColors();
  const { mode } = useTheme();
  const s = shadows(mode);
  const statusColor = STATUS_COLORS[client.status] ?? c.textDim;
  const statusLabel = STATUS_LABELS[client.status] ?? client.status;

  const daysSince = client.last_contact_at
    ? Math.floor(
        (Date.now() - new Date(client.last_contact_at).getTime()) / 86400000
      )
    : null;
  const isOverdue = daysSince === null || daysSince > 30;

  return (
    <Card onPress={onPress}>
      <View style={styles.rowInner}>
        {/* Avatar */}
        <Avatar name={client.name} size="md" color={statusColor} />

        {/* Info */}
        <View style={styles.rowInfo}>
          <Text
            style={[Type.bodyBold, { color: c.text }]}
            numberOfLines={1}
          >
            {client.name}
          </Text>
          <View style={styles.rowMeta}>
            {client.phone && (
              <Text
                style={[Type.caption, { color: c.textMuted }]}
                numberOfLines={1}
              >
                {client.phone}
              </Text>
            )}
            {client.phone && client.email && (
              <Text style={[Type.caption, { color: c.textFaint }]}> | </Text>
            )}
            {client.email && (
              <Text
                style={[Type.caption, { color: c.textMuted, flexShrink: 1 }]}
                numberOfLines={1}
              >
                {client.email}
              </Text>
            )}
          </View>
        </View>

        {/* Right side */}
        <View style={styles.rowRight}>
          <Badge
            label={statusLabel}
            color={statusColor}
            size="sm"
          />
          {daysSince !== null ? (
            <Text
              style={[
                Type.micro,
                { color: isOverdue ? c.danger : c.textDim },
              ]}
            >
              {daysSince === 0 ? "Today" : `${daysSince}d ago`}
            </Text>
          ) : (
            <Text style={[Type.micro, { color: c.danger }]}>
              Never
            </Text>
          )}
        </View>

        {/* Inline call button */}
        {client.phone ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onCall(client);
            }}
            hitSlop={4}
            style={[
              styles.inlineCallBtn,
              { backgroundColor: c.successDim },
            ]}
          >
            <Phone size={18} color={c.success} />
          </Pressable>
        ) : (
          <View style={{ width: 14 }}>
            <ChevronRight size={14} color={c.textFaint} />
          </View>
        )}

        {client.phone && <ChevronRight size={14} color={c.textFaint} />}
      </View>
    </Card>
  );
}

// ── Post-Contact Logging Sheet ──────────────────────────────────────────────

function PostContactSheet({
  contactType,
  clientName,
  onLog,
  onSkip,
}: {
  contactType: ContactType;
  clientName: string;
  onLog: (activityType: ActivityType, notes: string) => void;
  onSkip: () => void;
}) {
  const c = useColors();
  const [notes, setNotes] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>(
    contactType === "email" ? "note" : contactType
  );
  const [saving, setSaving] = useState(false);
  const notesRef = useRef<TextInput>(null);

  const title = CONTACT_TYPE_TITLES[contactType];

  const activityTypes: ActivityType[] = ["call", "text", "meeting", "showing", "note"];

  const handleLog = async () => {
    setSaving(true);
    await onLog(activityType, notes);
    setSaving(false);
  };

  return (
    <Sheet visible onClose={onSkip} title={title}>
      {/* Client name */}
      <View style={styles.postContactClientRow}>
        <Ionicons name="person-circle" size={24} color={c.primary} />
        <Text style={[Type.h3, { color: c.text, flex: 1 }]} numberOfLines={1}>
          {clientName}
        </Text>
      </View>

      {/* Activity type selector */}
      <Text style={[Type.caption, { color: c.textMuted, marginBottom: Space.sm, marginLeft: Space.xs }]}>
        ACTIVITY TYPE
      </Text>
      <View style={styles.activityTypeRow}>
        {activityTypes.map((at) => {
          const isSelected = activityType === at;
          return (
            <Pressable
              key={at}
              onPress={() => setActivityType(at)}
              style={[
                styles.activityTypeChip,
                {
                  backgroundColor: isSelected ? c.primaryDim : c.card,
                  borderColor: isSelected ? c.primaryBorder : c.cardBorder,
                },
              ]}
            >
              <Ionicons
                name={ACTIVITY_TYPE_ICONS[at]}
                size={14}
                color={isSelected ? c.primary : c.textDim}
              />
              <Text
                style={[
                  Type.caption,
                  {
                    color: isSelected ? c.primary : c.textDim,
                    fontWeight: isSelected ? "700" : "500",
                  },
                ]}
              >
                {ACTIVITY_TYPE_LABELS[at]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Notes input */}
      <View style={{ marginTop: Space.lg }}>
        <Input
          label="Notes"
          value={notes}
          onChange={setNotes}
          placeholder="What did you discuss?"
          multiline
        />
      </View>

      {/* Action buttons */}
      <View style={{ marginTop: Space.xl, gap: Space.sm }}>
        <Button
          label={saving ? "Logging..." : "Log & Close"}
          onPress={handleLog}
          loading={saving}
          variant="primary"
          icon="checkmark-circle"
        />
        <Pressable
          onPress={onSkip}
          style={styles.skipBtn}
        >
          <Text style={[Type.bodyBold, { color: c.textMuted, textAlign: "center" }]}>
            Skip
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

// ── Activity Timeline Colors ─────────────────────────────────────────────────

const ACTIVITY_DOT_COLORS: Record<string, string> = {
  call:    "#10B981", // green
  email:   "#3B82F6", // blue
  text:    "#6366F1", // indigo
  showing: "#F59E0B", // amber
  note:    "#6B7280", // gray
  meeting: "#6B7280", // gray
  offer:   "#8B5CF6", // purple
};

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  showing: "Showing",
  offer: "Offer",
  conditional: "Conditional",
  firm: "Firm",
};

const TX_STATUS_COLORS: Record<string, string> = {
  closed:  "#10B981",
  pending: "#F59E0B",
  fallen:  "#EF4444",
};

// ── Relative Date Helper ─────────────────────────────────────────────────────

function relativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "Last week";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "Last month";
  return `${Math.floor(diffDays / 30)} months ago`;
}

// ── Client Detail Sheet ─────────────────────────────────────────────────────

function ClientDetailSheet({
  client,
  onClose,
  onCall,
  onText,
  onEmail,
  onUpdate,
}: {
  client: Client;
  onClose: () => void;
  onCall: (c: Client) => void;
  onText: (c: Client) => void;
  onEmail: (c: Client) => void;
  onUpdate: (updates: Partial<Pick<Client, 'name' | 'email' | 'phone' | 'status' | 'notes'>>) => Promise<boolean>;
}) {
  const c = useColors();
  const statusColor = STATUS_COLORS[client.status] ?? c.textDim;

  const {
    clientActivities,
    fetchClientActivities,
    getClientDeals,
  } = useDataStore();

  const [activitiesLoading, setActivitiesLoading] = useState(true);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(client.name);
  const [editPhone, setEditPhone] = useState(client.phone ?? "");
  const [editEmail, setEditEmail] = useState(client.email ?? "");
  const [editStatus, setEditStatus] = useState(client.status);
  const [editNotes, setEditNotes] = useState(client.notes ?? "");
  const [savingEdit, setSavingEdit] = useState(false);

  // Reset edit form when client changes
  useEffect(() => {
    setEditName(client.name);
    setEditPhone(client.phone ?? "");
    setEditEmail(client.email ?? "");
    setEditStatus(client.status);
    setEditNotes(client.notes ?? "");
  }, [client]);

  const handleCancelEdit = useCallback(() => {
    setEditName(client.name);
    setEditPhone(client.phone ?? "");
    setEditEmail(client.email ?? "");
    setEditStatus(client.status);
    setEditNotes(client.notes ?? "");
    setEditing(false);
  }, [client]);

  const handleSaveEdit = useCallback(async () => {
    if (!editName.trim()) return;
    setSavingEdit(true);
    const updates: Partial<Pick<Client, 'name' | 'email' | 'phone' | 'status' | 'notes'>> = {
      name: editName.trim(),
      email: editEmail.trim() || null,
      phone: editPhone.trim() || null,
      status: editStatus,
      notes: editNotes.trim() || null,
    };
    const ok = await onUpdate(updates);
    setSavingEdit(false);
    if (ok) setEditing(false);
  }, [editName, editEmail, editPhone, editStatus, editNotes, onUpdate]);

  // Fetch activities when sheet opens
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchClientActivities(client.id);
      if (!cancelled) setActivitiesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  const activities = clientActivities[client.id] ?? [];
  const deals = useMemo(() => getClientDeals(client.name), [client.name]);

  const FLIGHT_STATUSES: { key: string; label: string }[] = [
    { key: "cruising", label: "Cruising" },
    { key: "turbulence", label: "Turbulence" },
    { key: "grounded", label: "Grounded" },
    { key: "boarding", label: "Boarding" },
    { key: "landed", label: "Landed" },
    { key: "departed", label: "Departed" },
  ];

  return (
    <Sheet visible onClose={onClose} title={editing ? "Edit Client" : client.name} maxHeight="95%">
      {/* ── Edit button in header area ── */}
      {!editing && (
        <View style={{ position: "absolute", top: Space.md, right: Space.xl + 44, zIndex: 10 }}>
          <Pressable
            onPress={() => setEditing(true)}
            hitSlop={8}
            style={[
              styles.editBtn,
              { backgroundColor: c.primaryDim },
            ]}
          >
            <Ionicons name="create-outline" size={16} color={c.primary} />
            <Text style={[Type.caption, { color: c.primary, fontWeight: "700" }]}>Edit</Text>
          </Pressable>
        </View>
      )}

      {editing ? (
        /* ── Edit Mode ── */
        <View style={{ gap: Space.md }}>
          <Input
            label="Full Name"
            value={editName}
            onChange={setEditName}
            placeholder="Client name"
          />
          <Input
            label="Phone"
            value={editPhone}
            onChange={setEditPhone}
            placeholder="+1 (555) 123-4567"
            keyboardType="phone-pad"
          />
          <Input
            label="Email"
            value={editEmail}
            onChange={setEditEmail}
            placeholder="email@example.com"
            keyboardType="email-address"
          />

          {/* Flight status pills */}
          <View style={{ gap: Space.xs }}>
            <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>
              FLIGHT STATUS
            </Text>
            <View style={styles.statusPillRow}>
              {FLIGHT_STATUSES.map((fs) => {
                const isSelected = editStatus === fs.key;
                const pillColor = StatusColors[fs.key] ?? c.textDim;
                return (
                  <Pressable
                    key={fs.key}
                    onPress={() => setEditStatus(fs.key)}
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: isSelected ? pillColor + "20" : c.card,
                        borderColor: isSelected ? pillColor + "50" : c.cardBorder,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusPillDot,
                        { backgroundColor: pillColor },
                      ]}
                    />
                    <Text
                      style={[
                        Type.caption,
                        {
                          color: isSelected ? pillColor : c.textDim,
                          fontWeight: isSelected ? "700" : "500",
                        },
                      ]}
                    >
                      {fs.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Input
            label="Notes"
            value={editNotes}
            onChange={setEditNotes}
            placeholder="Add notes..."
            multiline
          />

          {/* Save / Cancel */}
          <View style={{ marginTop: Space.sm, gap: Space.sm }}>
            <Button
              label={savingEdit ? "Saving..." : "Save Changes"}
              onPress={handleSaveEdit}
              loading={savingEdit}
              disabled={!editName.trim()}
              variant="primary"
              icon="checkmark-circle"
            />
            <Pressable onPress={handleCancelEdit} style={styles.skipBtn}>
              <Text style={[Type.bodyBold, { color: c.textMuted, textAlign: "center" }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* ── View Mode (existing) ── */
        <>
      {/* ── Client Header ── */}
      <View style={styles.detailHeader}>
        <Avatar name={client.name} size="lg" color={statusColor} />
        <View style={{ flex: 1, gap: Space.xs }}>
          <Text style={[Type.h2, { color: c.text }]}>{client.name}</Text>
          <Badge
            label={STATUS_LABELS[client.status] ?? client.status}
            color={statusColor}
            size="sm"
          />
        </View>
      </View>

      {/* ── Contact Info Card ── */}
      {(client.email || client.phone) && (
        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: c.card,
              borderColor: c.cardBorder,
            },
          ]}
        >
          {client.email && (
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={16} color={c.textMuted} />
              <Text style={[Type.body, { color: c.textSecondary, flex: 1 }]}>
                {client.email}
              </Text>
            </View>
          )}
          {client.phone && (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color={c.textMuted} />
              <Text style={[Type.body, { color: c.textSecondary, flex: 1 }]}>
                {client.phone}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Action Buttons ── */}
      <View style={styles.actionRow}>
        <ActionButton
          icon="call"
          label="Call"
          color={c.success}
          onPress={() => onCall(client)}
        />
        <ActionButton
          icon="chatbubble-ellipses"
          label="Text"
          color={c.blue}
          onPress={() => onText(client)}
        />
        <ActionButton
          icon="mail"
          label="Email"
          color={c.purple}
          onPress={() => onEmail(client)}
        />
      </View>

      {/* ── Tags ── */}
      {client.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {client.tags.map((t) => (
            <Badge key={t} label={t} size="sm" />
          ))}
        </View>
      )}

      {/* ── Notes ── */}
      {client.notes && (
        <View
          style={[
            styles.notesCard,
            {
              backgroundColor: c.card,
              borderColor: c.cardBorder,
            },
          ]}
        >
          <Text style={[Type.caption, { color: c.textMuted, marginBottom: Space.xs }]}>
            NOTES
          </Text>
          <Text style={[Type.body, { color: c.textSecondary }]}>
            {client.notes}
          </Text>
        </View>
      )}

      {/* ── Activity Timeline ── */}
      <View style={{ marginTop: Space.xl }}>
        <Text style={[Type.label, { color: c.textMuted, marginBottom: Space.md }]}>
          RECENT ACTIVITY
        </Text>
        {activitiesLoading ? (
          <View style={{ alignItems: "center", paddingVertical: Space.xl }}>
            <ActivityIndicator size="small" color={c.primary} />
          </View>
        ) : activities.length === 0 ? (
          <Text style={[Type.body, { color: c.textDim, marginBottom: Space.lg }]}>
            No activity logged yet
          </Text>
        ) : (
          <View style={{ marginBottom: Space.md }}>
            {activities.map((act, idx) => {
              const isLast = idx === activities.length - 1;
              const dotColor = ACTIVITY_DOT_COLORS[act.type] ?? c.textDim;
              const typeLabel =
                ACTIVITY_TYPE_LABELS[act.type as ActivityType] ?? act.type;
              return (
                <View key={act.id} style={styles.timelineRow}>
                  {/* Left: dot + connecting line */}
                  <View style={styles.timelineLeft}>
                    <View
                      style={[
                        styles.timelineDot,
                        { backgroundColor: dotColor },
                      ]}
                    />
                    {!isLast && (
                      <View
                        style={[
                          styles.timelineLine,
                          { backgroundColor: c.divider },
                        ]}
                      />
                    )}
                  </View>

                  {/* Right: content */}
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeader}>
                      <Text
                        style={[
                          Type.caption,
                          { color: dotColor, fontWeight: "700" },
                        ]}
                      >
                        {typeLabel}
                      </Text>
                      <Text style={[Type.micro, { color: c.textDim }]}>
                        {relativeDate(act.activity_date)}
                      </Text>
                    </View>
                    {act.description ? (
                      <Text
                        style={[
                          Type.body,
                          { color: c.textSecondary, marginTop: 2 },
                        ]}
                        numberOfLines={2}
                      >
                        {act.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Linked Deals ── */}
      <View style={{ marginTop: Space.lg }}>
        <Text style={[Type.label, { color: c.textMuted, marginBottom: Space.md }]}>
          DEALS
        </Text>
        {deals.pipeline.length === 0 && deals.transactions.length === 0 ? (
          <Text style={[Type.body, { color: c.textDim, marginBottom: Space.lg }]}>
            No linked deals
          </Text>
        ) : (
          <View style={{ gap: Space.sm, marginBottom: Space.lg }}>
            {/* Pipeline deals */}
            {deals.pipeline.map((deal) => {
              const stageColor = STAGE_COLORS[deal.stage] ?? c.textDim;
              return (
                <View
                  key={deal.id}
                  style={[
                    styles.dealRow,
                    {
                      backgroundColor: c.card,
                      borderColor: c.cardBorder,
                    },
                  ]}
                >
                  <Badge
                    label={STAGE_LABELS[deal.stage] ?? deal.stage}
                    color={stageColor}
                    size="sm"
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[Type.caption, { color: c.text }]}
                      numberOfLines={1}
                    >
                      {deal.address ?? "No address"}
                    </Text>
                    <Text style={[Type.micro, { color: c.textDim }]}>
                      Est. {fmtCurrency(deal.estimated_price)}
                    </Text>
                  </View>
                </View>
              );
            })}

            {/* Transactions */}
            {deals.transactions.map((tx) => {
              const txColor = TX_STATUS_COLORS[tx.status] ?? c.textDim;
              const gci = tx.gci_override ?? tx.sale_price * tx.commission_pct;
              return (
                <View
                  key={tx.id}
                  style={[
                    styles.dealRow,
                    {
                      backgroundColor: c.card,
                      borderColor: c.cardBorder,
                    },
                  ]}
                >
                  <Badge
                    label={tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                    color={txColor}
                    size="sm"
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[Type.caption, { color: c.text }]}
                      numberOfLines={1}
                    >
                      {tx.address ?? "No address"}
                    </Text>
                    <Text style={[Type.micro, { color: c.textDim }]}>
                      GCI {fmtCurrency(gci)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
        </>
      )}
    </Sheet>
  );
}

// ── Action Button ───────────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  const scaleAnim = useState(() => new Animated.Value(1))[0];

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.95,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          styles.actionBtn,
          {
            backgroundColor: color + "18",
            borderColor: color + "30",
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Ionicons name={icon} size={22} color={color} />
        <Text style={[Type.caption, { color, fontWeight: "700" }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Add Client Sheet ────────────────────────────────────────────────────────

function AddClientSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (c: Omit<Client, "id" | "created_at">) => Promise<boolean>;
}) {
  const c = useColors();
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
    <Sheet visible={visible} onClose={onClose} title="Add Client">
      <View style={{ gap: Space.md }}>
        <Input
          label="Full Name"
          value={name}
          onChange={setName}
          placeholder="Jane Smith"
        />
        <Input
          label="Email"
          value={email}
          onChange={setEmail}
          placeholder="jane@example.com"
          keyboardType="email-address"
        />
        <Input
          label="Phone"
          value={phone}
          onChange={setPhone}
          placeholder="+1 (555) 123-4567"
          keyboardType="phone-pad"
        />
        <View style={{ marginTop: Space.sm }}>
          <Button
            label={saving ? "Adding..." : "Add Client"}
            onPress={handleSubmit}
            loading={saving}
            disabled={!name.trim()}
            variant="primary"
            icon="person-add"
          />
        </View>
      </View>
    </Sheet>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Search bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    height: 48,
    paddingVertical: 0,
  },

  // Filter tabs
  tabs: {
    flexDirection: "row",
    gap: Space.sm,
    marginTop: Space.md,
    marginBottom: Space.xs,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.xs,
    height: 44,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.xs,
  },

  // Client row
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    minHeight: 48,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowRight: {
    alignItems: "flex-end",
    gap: Space.xs,
  },

  // Inline call button
  inlineCallBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  // Post-contact sheet
  postContactClientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginBottom: Space.xl,
  },
  activityTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
    marginBottom: Space.xs,
  },
  activityTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingHorizontal: Space.md,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  skipBtn: {
    paddingVertical: Space.md,
  },

  // Detail sheet
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.lg,
    marginBottom: Space.xl,
  },
  infoCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Space.lg,
    gap: Space.md,
    marginBottom: Space.lg,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },

  // Action buttons
  actionRow: {
    flexDirection: "row",
    gap: Space.md,
    marginBottom: Space.lg,
  },
  actionBtn: {
    borderRadius: Radius.md,
    paddingVertical: Space.lg,
    alignItems: "center",
    gap: Space.sm,
    borderWidth: 1,
  },

  // Tags & notes
  tagsRow: {
    flexDirection: "row",
    gap: Space.sm,
    flexWrap: "wrap",
    marginBottom: Space.md,
  },
  notesCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Space.lg,
  },

  // Activity timeline
  timelineRow: {
    flexDirection: "row",
    minHeight: 48,
  },
  timelineLeft: {
    width: 20,
    alignItems: "center",
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: Space.sm,
    paddingBottom: Space.md,
  },
  timelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Deal rows
  dealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },

  // Edit button
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingHorizontal: Space.md,
    height: 32,
    borderRadius: Radius.pill,
  },

  // Status pill row (edit mode)
  statusPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingHorizontal: Space.md,
    height: 34,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  statusPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
