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
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
  STAGE_COLORS,
  getInitials,
  fmtCurrency,
} from "@/lib/theme";
import { Card, Sheet, Badge, Avatar, Button, Input, EmptyState } from "@/components/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { useTranslation } from "react-i18next";
import { validateClient, FIELD_LIMITS } from "@agent-runway/core/validation/input-guards";
import {
  ClientFormFields,
  EMPTY_CLIENT_FORM,
  buildClientPayload,
  clientToFormState,
  type ClientFormState,
} from "@/components/ClientFormFields";

// ── Constants ─────────────────────────────────────────────────────────────────

type Filter = "all" | "active" | "cruising";

type ContactType = "call" | "text" | "email";
type ActivityType = "call" | "text" | "meeting" | "showing" | "note";

const ACTIVE_STATUSES = new Set(["boarding", "scheduled", "in_flight"]);

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
  const { t } = useTranslation("clients");
  const { t: tCommon } = useTranslation("common");

  const {
    clients, fetchClients, addClient, addActivity, updateClient, isLoading,
    smartListCounts, overdueFollowupClients, uncontactedLeadClients,
    clientPipelineContext,
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
    daysSinceContact: number | null;
    pipelineContext: string | null;
  } | null>(null);
  const [showPostContact, setShowPostContact] = useState(false);

  useEffect(() => {
    if (clients.length === 0) fetchClients();
  }, []);

  // Re-fetch on tab focus
  useFocusEffect(
    useCallback(() => {
      fetchClients();
    }, [])
  );

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

  const getContactContext = useCallback((client: Client) => {
    const daysSince = client.last_contact_at
      ? Math.floor((Date.now() - new Date(client.last_contact_at).getTime()) / 86400000)
      : null;
    const pipeline = clientPipelineContext(client.name);
    return { daysSinceContact: daysSince, pipelineContext: pipeline };
  }, [clientPipelineContext]);

  const handleCall = useCallback((client: Client) => {
    if (!client.phone) {
      Alert.alert(t("contact.noPhone"), t("contact.noPhoneBody"));
      return;
    }
    const ctx = getContactContext(client);
    setPendingContact({ clientId: client.id, clientName: client.name, type: "call", ...ctx });
    Linking.openURL(`tel:${client.phone}`);
  }, [getContactContext]);

  const handleText = useCallback((client: Client) => {
    if (!client.phone) {
      Alert.alert(t("contact.noPhone"), t("contact.noPhoneBody"));
      return;
    }
    const ctx = getContactContext(client);
    setPendingContact({ clientId: client.id, clientName: client.name, type: "text", ...ctx });
    Linking.openURL(`sms:${client.phone}`);
  }, [getContactContext]);

  const handleEmail = useCallback((client: Client) => {
    if (!client.email) {
      Alert.alert(t("contact.noEmail"), t("contact.noEmailBody"));
      return;
    }
    const ctx = getContactContext(client);
    setPendingContact({ clientId: client.id, clientName: client.name, type: "email", ...ctx });
    Linking.openURL(`mailto:${client.email}`);
  }, [getContactContext]);

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
  const cruising = useMemo(
    () => clients.filter((cl) => cl.status === "cruising"),
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
      filter === "active" ? active : filter === "cruising" ? cruising : clients;

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
  }, [clients, active, cruising, filter, search, smartFilter]);

  // ── Filter tab definitions ────────────────────────────────────────────────

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: t("filters.all"), count: clients.length },
    { key: "active", label: t("filters.active"), count: active.length },
    { key: "cruising", label: t("filters.cruising"), count: cruising.length },
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
          <Text style={[Type.h1, { color: c.text }]}>{t("title")}</Text>
          <Button
            label={tCommon("actions.add")}
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
            placeholder={t("search.placeholder")}
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
                        ? "#EF4444" + "38"
                        : c.card,
                    borderWidth: 1,
                    borderColor:
                      smartFilter === "overdue"
                        ? "#EF4444" + "66"
                        : c.cardBorder,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Clock size={13} color="#EF4444" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#EF4444" }}>
                  {slCounts.overdueFollowups} {t("smartLists.overdueFollowups")}
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
                        ? "#F59E0B" + "38"
                        : c.card,
                    borderWidth: 1,
                    borderColor:
                      smartFilter === "uncontacted"
                        ? "#F59E0B" + "66"
                        : c.cardBorder,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <UserPlus size={13} color="#F59E0B" />
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#F59E0B" }}>
                  {slCounts.uncontactedLeads} {t("smartLists.uncontactedLeads")}
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
                  {slCounts.hotPipeline} {t("smartLists.hotDeals")}
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
              title={t("empty.noMatchTitle")}
              subtitle={t("empty.noMatchSubtitle", { query: search.trim() })}
            />
          ) : (
            <EmptyState
              icon="people-outline"
              title={t("empty.title")}
              subtitle={t("empty.subtitle")}
              actionLabel={t("empty.actionLabel")}
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
          daysSinceContact={pendingContact.daysSinceContact}
          pipelineContext={pendingContact.pipelineContext}
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
  const { t } = useTranslation("clients");
  const statusColor = STATUS_COLORS[client.status] ?? c.textDim;
  const statusLabel = t(`status.${client.status}`, { defaultValue: client.status });

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
              {daysSince === 0 ? t("detail.today") : t("detail.daysAgo", { count: daysSince })}
            </Text>
          ) : (
            <Text style={[Type.micro, { color: c.danger }]}>
              {t("detail.never")}
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
  daysSinceContact,
  pipelineContext,
  onLog,
  onSkip,
}: {
  contactType: ContactType;
  clientName: string;
  daysSinceContact: number | null;
  pipelineContext: string | null;
  onLog: (activityType: ActivityType, notes: string) => void;
  onSkip: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation("clients");
  const [notes, setNotes] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>(
    contactType === "email" ? "note" : contactType
  );
  const [saving, setSaving] = useState(false);

  const contactTypeKey: Record<ContactType, string> = {
    call: "contact.logCall",
    text: "contact.logText",
    email: "contact.logEmail",
  };
  const title = t(contactTypeKey[contactType]);

  // Build context string
  const contextLine = daysSinceContact !== null
    ? daysSinceContact === 0
      ? t("postContact.contactedToday")
      : daysSinceContact === 1
        ? t("postContact.contactedYesterday")
        : t("postContact.firstContactIn", { count: daysSinceContact })
    : t("postContact.firstEverContact");

  // Suggested note based on pipeline
  const suggestedNote = pipelineContext
    ? `Follow-up re: ${pipelineContext}`
    : null;

  const activityTypes: ActivityType[] = ["call", "text", "meeting", "showing", "note"];

  const handleLog = async () => {
    setSaving(true);
    await onLog(activityType, notes);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setSaving(false);
  };

  return (
    <Sheet visible onClose={onSkip} title={title}>
      {/* Client name + context */}
      <View style={styles.postContactClientRow}>
        <Ionicons name="person-circle" size={24} color={c.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[Type.h3, { color: c.text }]} numberOfLines={1}>
            {clientName}
          </Text>
          <Text style={[Type.caption, { color: daysSinceContact !== null && daysSinceContact > 14 ? "#F59E0B" : c.textDim, marginTop: 2 }]}>
            {contextLine}
          </Text>
        </View>
      </View>

      {/* Pipeline context badge */}
      {pipelineContext && (
        <View style={{
          backgroundColor: c.primaryDim,
          borderRadius: Radius.md,
          padding: Space.md,
          marginBottom: Space.lg,
          borderWidth: 1,
          borderColor: c.primaryBorder,
          flexDirection: "row",
          alignItems: "center",
          gap: Space.sm,
        }}>
          <Ionicons name="briefcase-outline" size={14} color={c.primary} />
          <Text style={[Type.caption, { color: c.primaryLight, flex: 1 }]}>
            {pipelineContext}
          </Text>
        </View>
      )}

      {/* Activity type selector */}
      <Text style={[Type.caption, { color: c.textMuted, marginBottom: Space.sm, marginLeft: Space.xs }]}>
        {t("postContact.activityType")}
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
                {t(`activity.${at}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Notes input with suggested note */}
      <View style={{ marginTop: Space.lg }}>
        <Input
          label={t("postContact.notesLabel")}
          value={notes}
          onChange={setNotes}
          placeholder={suggestedNote ?? t("postContact.notesPlaceholder")}
          multiline
        />
        {suggestedNote && !notes && (
          <Pressable
            onPress={() => setNotes(suggestedNote)}
            style={{ marginTop: Space.xs }}
          >
            <Text style={[Type.micro, { color: c.primary }]}>
              {t("postContact.tapToUse", { note: suggestedNote })}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Action buttons */}
      <View style={{ marginTop: Space.xl, gap: Space.sm }}>
        <Button
          label={saving ? t("postContact.logging") : t("postContact.logAndClose")}
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
            {t("postContact.skipLabel")}
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

// Stage labels now use t("status.*") from i18n

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
  onUpdate: (
    updates: Partial<Omit<Client, "id" | "created_at" | "last_contact_at">>,
  ) => Promise<boolean>;
}) {
  const c = useColors();
  const { t } = useTranslation("clients");
  const { t: tCommon } = useTranslation("common");
  const statusColor = STATUS_COLORS[client.status] ?? c.textDim;

  const {
    clientActivities,
    fetchClientActivities,
    getClientDeals,
    quickLogActivity,
  } = useDataStore();

  const [quickLogging, setQuickLogging] = useState<string | null>(null);

  const [activitiesLoading, setActivitiesLoading] = useState(true);

  // Edit mode state — wraps the shared ClientFormFields plus the existing
  // status pill row + the new archive controls.
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<ClientFormState>(() =>
    clientToFormState(client),
  );
  const [editStatus, setEditStatus] = useState(client.status);
  const [editArchived, setEditArchived] = useState<boolean>(
    !!client.archived_at,
  );
  const [editArchiveReason, setEditArchiveReason] =
    useState<NonNullable<Client["archive_reason"]>>(
      client.archive_reason ?? "do_not_contact",
    );
  const [savingEdit, setSavingEdit] = useState(false);

  // Reset edit form when client changes
  useEffect(() => {
    setEditForm(clientToFormState(client));
    setEditStatus(client.status);
    setEditArchived(!!client.archived_at);
    setEditArchiveReason(client.archive_reason ?? "do_not_contact");
  }, [client]);

  const patchEdit = useCallback(
    (p: Partial<ClientFormState>) =>
      setEditForm((prev) => ({ ...prev, ...p })),
    [],
  );

  const handleCancelEdit = useCallback(() => {
    setEditForm(clientToFormState(client));
    setEditStatus(client.status);
    setEditArchived(!!client.archived_at);
    setEditArchiveReason(client.archive_reason ?? "do_not_contact");
    setEditing(false);
  }, [client]);

  const handleSaveEdit = useCallback(async () => {
    // Compose canonical name from first/last (mirrors web)
    const fullName =
      `${editForm.first_name.trim()} ${editForm.last_name.trim()}`.trim() ||
      client.name;
    if (!fullName) return;
    setSavingEdit(true);

    const payload = buildClientPayload(editForm);
    const updates: Partial<Omit<Client, "id" | "created_at" | "last_contact_at">> = {
      name: fullName.slice(0, FIELD_LIMITS.clientName),
      status: editStatus,
      ...payload,
      archived_at: editArchived
        ? client.archived_at ?? new Date().toISOString()
        : null,
      archive_reason: editArchived ? editArchiveReason : null,
    };
    const ok = await onUpdate(updates);
    setSavingEdit(false);
    if (ok) setEditing(false);
  }, [editForm, editStatus, editArchived, editArchiveReason, onUpdate, client]);

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
    { key: "boarding", label: t("status.boarding") },
    { key: "scheduled", label: t("status.scheduled") },
    { key: "in_flight", label: t("status.in_flight") },
    { key: "cruising", label: t("status.cruising") },
  ];

  return (
    <Sheet visible onClose={onClose} title={editing ? t("editClient.title") : client.name} maxHeight="95%">
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
            <Text style={[Type.caption, { color: c.primary, fontWeight: "700" }]}>{t("editClient.edit")}</Text>
          </Pressable>
        </View>
      )}

      {editing ? (
        /* ── Edit Mode ── */
        <View style={{ gap: Space.md }}>
          {/* Flight status pills — kept at the top because it's the most-edited field */}
          <View style={{ gap: Space.xs }}>
            <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>
              {t("detail.flightStatus")}
            </Text>
            <View style={styles.statusPillRow}>
              {FLIGHT_STATUSES.map((fs) => {
                const isSelected = editStatus === fs.key;
                const pillColor = STATUS_COLORS[fs.key] ?? c.textDim;
                return (
                  <Pressable
                    key={fs.key}
                    onPress={() => setEditStatus(fs.key)}
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: isSelected ? pillColor + "38" : c.card,
                        borderColor: isSelected ? pillColor + "80" : c.cardBorder,
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

          <ClientFormFields state={editForm} setState={patchEdit} />

          {/* ── Archive ── */}
          <View
            style={{
              gap: Space.sm,
              padding: Space.md,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: c.cardBorder,
              backgroundColor: c.card,
            }}
          >
            <Pressable
              onPress={() => setEditArchived((a) => !a)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: Space.sm,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: editArchived ? c.warning : c.cardBorder,
                  backgroundColor: editArchived ? c.warning : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {editArchived && (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                )}
              </View>
              <Text style={[Type.bodyBold, { color: c.text, flex: 1 }]}>
                {t("editClient.archiveLabel")}
              </Text>
            </Pressable>
            {editArchived && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.xs }}>
                {(["deceased", "moved_away", "do_not_contact", "other"] as const).map(
                  (r) => {
                    const selected = editArchiveReason === r;
                    return (
                      <Pressable
                        key={r}
                        onPress={() => setEditArchiveReason(r)}
                        style={({ pressed }) => ({
                          paddingHorizontal: Space.md,
                          height: 30,
                          borderRadius: Radius.pill,
                          borderWidth: 1,
                          borderColor: selected ? c.warning : c.cardBorder,
                          backgroundColor: selected ? c.warningDim : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Text
                          style={[
                            Type.caption,
                            {
                              color: selected ? c.warning : c.textSecondary,
                              fontWeight: selected ? "700" : "500",
                            },
                          ]}
                        >
                          {t(`editClient.archiveReasons.${r}`)}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            )}
          </View>

          {/* Save / Cancel */}
          <View style={{ marginTop: Space.sm, gap: Space.sm }}>
            <Button
              label={savingEdit ? t("editClient.saving") : t("editClient.save")}
              onPress={handleSaveEdit}
              loading={savingEdit}
              disabled={
                !(editForm.first_name.trim() || editForm.last_name.trim() || client.name)
              }
              variant="primary"
              icon="checkmark-circle"
            />
            <Pressable onPress={handleCancelEdit} style={styles.skipBtn}>
              <Text style={[Type.bodyBold, { color: c.textMuted, textAlign: "center" }]}>
                {tCommon("nav.cancel")}
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
            label={t(`status.${client.status}`, { defaultValue: client.status })}
            color={statusColor}
            size="sm"
          />
          {/* Auto-transition countdown removed: landed stage was collapsed into cruising. */}
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
          label={t("contact.call")}
          color={c.success}
          onPress={() => onCall(client)}
        />
        <ActionButton
          icon="chatbubble-ellipses"
          label={t("contact.text")}
          color={c.blue}
          onPress={() => onText(client)}
        />
        <ActionButton
          icon="mail"
          label={t("contact.email")}
          color={c.purple}
          onPress={() => onEmail(client)}
        />
      </View>

      {/* ── Quick-Log Buttons (one-tap, no sheet) ── */}
      <View style={{ marginBottom: Space.lg }}>
        <Text style={[Type.label, { color: c.textMuted, marginBottom: Space.sm }]}>
          {t("quickLog.title")}
        </Text>
        <View style={{ flexDirection: "row", gap: Space.sm }}>
          {(
            [
              { key: "call", label: t("quickLog.justCalled"), icon: "call" as const, color: "#10B981" },
              { key: "text", label: t("quickLog.justTexted"), icon: "chatbubble-ellipses" as const, color: "#3B82F6" },
              { key: "voicemail", label: t("quickLog.voicemail"), icon: "recording" as const, color: "#8B5CF6" },
            ] as const
          ).map((q) => (
            <Pressable
              key={q.key}
              onPress={async () => {
                setQuickLogging(q.key);
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                } catch {}
                await quickLogActivity(client.id, q.key as any);
                await fetchClientActivities(client.id);
                setQuickLogging(null);
              }}
              disabled={quickLogging !== null}
              style={({ pressed }) => [
                {
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  paddingVertical: Space.sm + 2,
                  borderRadius: Radius.md,
                  backgroundColor: quickLogging === q.key ? q.color + "55" : q.color + "26",
                  borderWidth: 1,
                  borderColor: q.color + "55",
                },
                pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
              ]}
            >
              <Ionicons name={q.icon} size={14} color={q.color} />
              <Text style={{ fontSize: 11, fontWeight: "700", color: q.color }}>
                {quickLogging === q.key ? t("quickLog.logged") : q.label}
              </Text>
            </Pressable>
          ))}
        </View>
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
            {t("detail.notes")}
          </Text>
          <Text style={[Type.body, { color: c.textSecondary }]}>
            {client.notes}
          </Text>
        </View>
      )}

      {/* ── Activity Timeline ── */}
      <View style={{ marginTop: Space.xl }}>
        <Text style={[Type.label, { color: c.textMuted, marginBottom: Space.md }]}>
          {t("detail.recentActivity")}
        </Text>
        {activitiesLoading ? (
          <View style={{ alignItems: "center", paddingVertical: Space.xl }}>
            <ActivityIndicator size="small" color={c.primary} />
          </View>
        ) : activities.length === 0 ? (
          <Text style={[Type.body, { color: c.textDim, marginBottom: Space.lg }]}>
            {t("detail.noActivity")}
          </Text>
        ) : (
          <View style={{ marginBottom: Space.md }}>
            {activities.map((act, idx) => {
              const isLast = idx === activities.length - 1;
              const dotColor = ACTIVITY_DOT_COLORS[act.type] ?? c.textDim;
              const typeLabel =
                t(`activity.${act.type}`, { defaultValue: act.type });
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
          {t("detail.deals")}
        </Text>
        {deals.pipeline.length === 0 && deals.transactions.length === 0 ? (
          <Text style={[Type.body, { color: c.textDim, marginBottom: Space.lg }]}>
            {t("detail.noLinkedDeals")}
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
                    label={t(`status.${deal.stage}`, { defaultValue: deal.stage })}
                    color={stageColor}
                    size="sm"
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[Type.caption, { color: c.text }]}
                      numberOfLines={1}
                    >
                      {deal.address ?? t("detail.noAddress")}
                    </Text>
                    <Text style={[Type.micro, { color: c.textDim }]}>
                      {t("detail.estimated", { amount: fmtCurrency(deal.estimated_price) })}
                    </Text>
                  </View>
                </View>
              );
            })}

            {/* Transactions */}
            {deals.transactions.map((tx) => {
              const txColor = TX_STATUS_COLORS[tx.status] ?? c.textDim;
              const gci = tx.gci_override ?? (tx.sale_price * tx.commission_pct * (tx.team_split_pct ?? 1));
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
                      {tx.address ?? t("detail.noAddress")}
                    </Text>
                    <Text style={[Type.micro, { color: c.textDim }]}>
                      {t("detail.gciAmount", { amount: fmtCurrency(gci) })}
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
            backgroundColor: color + "38",
            borderColor: color + "66",
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
  onAdd: (
    c: Partial<Omit<Client, "id" | "created_at">> & {
      name: string;
      status: string;
      tags: string[];
    },
  ) => Promise<boolean>;
}) {
  const c = useColors();
  const { t } = useTranslation("clients");
  const [form, setForm] = useState<ClientFormState>(EMPTY_CLIENT_FORM);
  const [saving, setSaving] = useState(false);

  const patch = useCallback(
    (p: Partial<ClientFormState>) => setForm((prev) => ({ ...prev, ...p })),
    [],
  );

  // Derived name (display + dedup key on the server)
  const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();

  const handleSubmit = async () => {
    // ── Validate the high-impact fields (email + phone) ─────────────────
    const v = validateClient({
      name: fullName,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    });
    if (!v.valid) {
      Alert.alert("Invalid", v.errors[0]);
      return;
    }
    if (!fullName) {
      Alert.alert("Invalid", t("addClient.missingName"));
      return;
    }
    setSaving(true);
    const payload = buildClientPayload(form);
    const ok = await onAdd({
      name: fullName.slice(0, FIELD_LIMITS.clientName),
      status: "boarding",
      tags: [],
      ...payload,
    });
    setSaving(false);
    if (ok) {
      setForm(EMPTY_CLIENT_FORM);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("addClient.title")} maxHeight="95%">
      <View style={{ gap: Space.md, paddingBottom: Space.lg }}>
        <ClientFormFields state={form} setState={patch} />
        <View style={{ marginTop: Space.sm }}>
          <Button
            label={saving ? t("addClient.adding") : t("addClient.save")}
            onPress={handleSubmit}
            loading={saving}
            disabled={!fullName}
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
