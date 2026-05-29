/**
 * Universal Search — Primary navigation action (center tab).
 *
 * Auto-focuses the search input on mount. Shows recent searches and quick
 * actions when empty, live-filtered results grouped by type while typing.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Search as SearchIcon,
  X,
  Clock,
  UserPlus,
  Handshake,
  Receipt,
  ChevronRight,
  Pencil,
} from "lucide-react-native";
import {
  useColors,
  useTheme,
  Space,
  Radius,
  Type,
  shadows,
  fmtCurrency,
  STAGE_COLORS,
  STATUS_COLORS,
} from "@/lib/theme";
import { useT } from "@/lib/useT";
import { storage } from "@/lib/mmkv";
import { useDataStore, type Client } from "@/stores/data-store";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";

// ── Recent searches persistence ─────────────────────────────────────────────

const RECENT_KEY = "recent_searches";
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    const raw = storage.getString(RECENT_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    // ignore
  }
  return [];
}

function saveRecentSearch(query: string) {
  try {
    const current = getRecentSearches();
    const filtered = current.filter((q) => q.toLowerCase() !== query.toLowerCase());
    const next = [query, ...filtered].slice(0, MAX_RECENT);
    storage.set(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [query];
  }
}

function clearRecentSearches() {
  try {
    storage.delete(RECENT_KEY);
  } catch {
    // ignore
  }
}

// ── Section types for the FlatList ──────────────────────────────────────────

type SectionHeader = { type: "header"; title: string };
type ClientRow = { type: "client"; data: ReturnType<typeof useDataStore.getState>["clients"][number] };
type DealRow = { type: "deal"; data: ReturnType<typeof useDataStore.getState>["pipeline"][number] };
type TransactionRow = { type: "transaction"; data: ReturnType<typeof useDataStore.getState>["transactions"][number] };
type EmptyRow = { type: "empty"; query: string };
type RecentRow = { type: "recent"; query: string };
type QuickActionsRow = { type: "quickActions" };
type RecentHeader = { type: "recentHeader" };

type ListItem =
  | SectionHeader
  | ClientRow
  | DealRow
  | TransactionRow
  | EmptyRow
  | RecentRow
  | QuickActionsRow
  | RecentHeader;

// ── Component ───────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const search = useDataStore((s) => s.search);
  const addActivity = useDataStore((s) => s.addActivity);
  const { t } = useT("profile");

  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);
  const [quickNoteClient, setQuickNoteClient] = useState<Client | null>(null);

  // Auto-focus on mount
  useEffect(() => {
    const timeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timeout);
  }, []);

  // Compute results
  const results = useMemo(() => {
    if (!query.trim()) return null;
    return search(query);
  }, [query, search]);

  const totalResults =
    results ? results.clients.length + results.pipeline.length + results.transactions.length : 0;

  // Build flat list data
  const listData = useMemo<ListItem[]>(() => {
    // Empty query: show recent + quick actions
    if (!results) {
      const items: ListItem[] = [];

      if (recentSearches.length > 0) {
        items.push({ type: "recentHeader" });
        recentSearches.forEach((q) => items.push({ type: "recent", query: q }));
      }

      items.push({ type: "quickActions" });
      return items;
    }

    // Has query but no results
    if (totalResults === 0) {
      return [{ type: "empty", query }];
    }

    // Build grouped results
    const items: ListItem[] = [];

    if (results.clients.length > 0) {
      items.push({ type: "header", title: t("search.clients") });
      results.clients.forEach((client) => items.push({ type: "client", data: client }));
    }

    if (results.pipeline.length > 0) {
      items.push({ type: "header", title: t("search.deals") });
      results.pipeline.forEach((deal) => items.push({ type: "deal", data: deal }));
    }

    if (results.transactions.length > 0) {
      items.push({ type: "header", title: t("search.transactions") });
      results.transactions.forEach((tx) => items.push({ type: "transaction", data: tx }));
    }

    return items;
  }, [results, totalResults, query, recentSearches, t]);

  // Handlers
  const handleClear = useCallback(() => {
    setQuery("");
    inputRef.current?.focus();
  }, []);

  const handleRecentTap = useCallback((q: string) => {
    setQuery(q);
  }, []);

  const handleClearRecent = useCallback(() => {
    clearRecentSearches();
    setRecentSearches([]);
  }, []);

  const handleResultTap = useCallback(
    (item: ClientRow | DealRow | TransactionRow) => {
      // Save to recent searches
      const updated = saveRecentSearch(query);
      setRecentSearches(updated);
      Keyboard.dismiss();

      switch (item.type) {
        case "client":
          router.navigate("/(app)/clients");
          break;
        case "deal":
          router.navigate("/(app)/deals");
          break;
        case "transaction":
          router.navigate("/(app)/deals");
          break;
      }
    },
    [query, router]
  );

  // ── Render helpers ──────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      switch (item.type) {
        case "header":
          return <SectionHeaderView title={item.title} colors={c} />;
        case "client":
          return <ClientRowView item={item.data} colors={c} onPress={() => handleResultTap(item)} onQuickNote={() => setQuickNoteClient(item.data)} />;
        case "deal":
          return <DealRowView item={item.data} colors={c} onPress={() => handleResultTap(item)} />;
        case "transaction":
          return (
            <TransactionRowView item={item.data} colors={c} onPress={() => handleResultTap(item)} />
          );
        case "empty":
          return <EmptyView query={item.query} colors={c} t={t} />;
        case "recentHeader":
          return (
            <RecentHeaderView colors={c} onClear={handleClearRecent} t={t} />
          );
        case "recent":
          return <RecentRowView query={item.query} colors={c} onPress={() => handleRecentTap(item.query)} />;
        case "quickActions":
          return <QuickActionsView colors={c} mode={mode} sh={sh} router={router} t={t} />;
        default:
          return null;
      }
    },
    [c, mode, sh, router, handleResultTap, handleRecentTap, handleClearRecent, setQuickNoteClient, t]
  );

  const keyExtractor = useCallback(
    (item: ListItem, index: number) => {
      switch (item.type) {
        case "header":
          return `h-${item.title}`;
        case "client":
          return `c-${item.data.id}`;
        case "deal":
          return `d-${item.data.id}`;
        case "transaction":
          return `t-${item.data.id}`;
        case "recent":
          return `r-${item.query}`;
        default:
          return `${item.type}-${index}`;
      }
    },
    []
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]} edges={["top"]}>
      {/* Search input */}
      <View style={{ paddingHorizontal: Space.lg, paddingTop: Space.md, paddingBottom: Space.sm }}>
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: c.card,
              borderColor: query ? c.primaryBorder : c.cardBorder,
              borderWidth: 1,
              borderRadius: Radius.xl,
              ...sh.card,
            },
          ]}
        >
          <SearchIcon size={20} color={c.textMuted} strokeWidth={2} />
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              Type.body,
              { color: c.text, flex: 1 },
            ]}
            placeholder={t("search.placeholder")}
            placeholderTextColor={c.textDim}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={handleClear} hitSlop={12} style={styles.clearBtn}>
              <View style={[styles.clearCircle, { backgroundColor: c.textDim + "55" }]}>
                <X size={14} color={c.textMuted} strokeWidth={2.5} />
              </View>
            </Pressable>
          )}
        </View>
      </View>

      {/* Results */}
      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Space.section }}
      />

      {/* Quick Note Sheet */}
      {quickNoteClient && (
        <QuickNoteSheet
          client={quickNoteClient}
          onClose={() => setQuickNoteClient(null)}
          onSave={async (type, description) => {
            await addActivity({
              client_id: quickNoteClient.id,
              type,
              description: description.trim() || null,
              activity_date: new Date().toISOString(),
            });
            setQuickNoteClient(null);
          }}
          t={t}
        />
      )}
    </SafeAreaView>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function SectionHeaderView({ title, colors: c }: { title: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.sectionHeader, { borderBottomColor: c.divider }]}>
      <Text style={[Type.label, { color: c.textMuted }]}>{title}</Text>
    </View>
  );
}

function ClientRowView({
  item,
  colors: c,
  onPress,
  onQuickNote,
}: {
  item: ReturnType<typeof useDataStore.getState>["clients"][number];
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  onQuickNote: () => void;
}) {
  const statusColor = STATUS_COLORS[item.status] ?? c.textMuted;
  const statusLabel = item.status
    ? item.status.charAt(0).toUpperCase() + item.status.slice(1)
    : "Unknown";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? c.primaryDim : "transparent" },
      ]}
    >
      <Avatar name={item.name} size="md" />
      <View style={styles.rowContent}>
        <Text style={[Type.bodyBold, { color: c.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.phone ? (
          <Text style={[Type.caption, { color: c.textMuted }]} numberOfLines={1}>
            {item.phone}
          </Text>
        ) : item.email ? (
          <Text style={[Type.caption, { color: c.textMuted }]} numberOfLines={1}>
            {item.email}
          </Text>
        ) : null}
      </View>
      <Badge label={statusLabel} color={statusColor} size="sm" />
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onQuickNote();
        }}
        hitSlop={8}
        style={[styles.quickNoteBtn, { backgroundColor: c.primaryDim }]}
      >
        <Pencil size={14} color={c.primary} strokeWidth={2.5} />
      </Pressable>
      <ChevronRight size={16} color={c.textDim} strokeWidth={2} style={{ marginLeft: Space.xs }} />
    </Pressable>
  );
}

function DealRowView({
  item,
  colors: c,
  onPress,
}: {
  item: ReturnType<typeof useDataStore.getState>["pipeline"][number];
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const stageColor = STAGE_COLORS[item.stage] ?? c.textMuted;
  const stageLabel = item.stage.charAt(0).toUpperCase() + item.stage.slice(1);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? c.primaryDim : "transparent" },
      ]}
    >
      <View style={[styles.dealIcon, { backgroundColor: stageColor + "38" }]}>
        <Handshake size={18} color={stageColor} strokeWidth={2} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[Type.bodyBold, { color: c.text }]} numberOfLines={1}>
          {item.address ?? item.client_name ?? "Untitled Deal"}
        </Text>
        <Text style={[Type.caption, { color: c.textMuted }]} numberOfLines={1}>
          {fmtCurrency(item.estimated_price)}
          {item.client_name && item.address ? ` \u00B7 ${item.client_name}` : ""}
        </Text>
      </View>
      <Badge label={stageLabel} color={stageColor} size="sm" />
      <ChevronRight size={16} color={c.textDim} strokeWidth={2} style={{ marginLeft: Space.sm }} />
    </Pressable>
  );
}

function TransactionRowView({
  item,
  colors: c,
  onPress,
}: {
  item: ReturnType<typeof useDataStore.getState>["transactions"][number];
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const statusColorMap: Record<string, string> = {
    closed: c.success,
    pending: c.warning,
    fallen: c.danger,
  };
  const statusColor = statusColorMap[item.status] ?? c.textMuted;
  const statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1);
  const gci = item.gci_override ?? (item.sale_price * item.commission_pct * (item.team_split_pct ?? 1));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? c.primaryDim : "transparent" },
      ]}
    >
      <View style={[styles.dealIcon, { backgroundColor: statusColor + "38" }]}>
        <Receipt size={18} color={statusColor} strokeWidth={2} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[Type.bodyBold, { color: c.text }]} numberOfLines={1}>
          {item.address ?? item.client_name ?? "Transaction"}
        </Text>
        <Text style={[Type.caption, { color: c.textMuted }]} numberOfLines={1}>
          GCI {fmtCurrency(gci)}
          {item.client_name && item.address ? ` \u00B7 ${item.client_name}` : ""}
        </Text>
      </View>
      <Badge label={statusLabel} color={statusColor} size="sm" />
      <ChevronRight size={16} color={c.textDim} strokeWidth={2} style={{ marginLeft: Space.sm }} />
    </Pressable>
  );
}

function EmptyView({ query, colors: c, t }: { query: string; colors: ReturnType<typeof useColors>; t: (key: string, opts?: any) => string }) {
  return (
    <View style={styles.emptyContainer}>
      <SearchIcon size={48} color={c.textDim} strokeWidth={1.2} />
      <Text style={[Type.h3, { color: c.text, marginTop: Space.lg, textAlign: "center" }]}>
        {t("search.noResults", { query })}
      </Text>
      <Text style={[Type.caption, { color: c.textMuted, marginTop: Space.sm, textAlign: "center" }]}>
        {t("search.noResultsHint")}
      </Text>
    </View>
  );
}

function RecentHeaderView({
  colors: c,
  onClear,
  t,
}: {
  colors: ReturnType<typeof useColors>;
  onClear: () => void;
  t: (key: string) => string;
}) {
  return (
    <View style={[styles.sectionHeader, { borderBottomColor: c.divider }]}>
      <Text style={[Type.label, { color: c.textMuted }]}>{t("search.recentSearches")}</Text>
      <Pressable onPress={onClear} hitSlop={8}>
        <Text style={[Type.caption, { color: c.primary }]}>{t("search.clear")}</Text>
      </Pressable>
    </View>
  );
}

function RecentRowView({
  query,
  colors: c,
  onPress,
}: {
  query: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.recentRow,
        { backgroundColor: pressed ? c.primaryDim : "transparent" },
      ]}
    >
      <Clock size={16} color={c.textDim} strokeWidth={2} />
      <Text style={[Type.body, { color: c.textSecondary, flex: 1, marginLeft: Space.md }]} numberOfLines={1}>
        {query}
      </Text>
      <ChevronRight size={14} color={c.textDim} strokeWidth={2} />
    </Pressable>
  );
}

function QuickActionsView({
  colors: c,
  mode,
  sh,
  router,
  t,
}: {
  colors: ReturnType<typeof useColors>;
  mode: string;
  sh: ReturnType<typeof shadows>;
  router: ReturnType<typeof useRouter>;
  t: (key: string) => string;
}) {
  const actions = [
    {
      icon: UserPlus,
      label: t("search.addClient"),
      color: c.primary,
      onPress: () => router.navigate("/(app)/clients"),
    },
    {
      icon: Handshake,
      label: t("search.addDeal"),
      color: c.success,
      onPress: () => router.navigate("/(app)/deals"),
    },
    {
      icon: Receipt,
      label: t("search.scanReceipt"),
      color: c.gold,
      onPress: () => router.navigate("/profile/expenses"),
    },
  ];

  return (
    <View style={{ paddingHorizontal: Space.lg, paddingTop: Space.xl }}>
      <Text style={[Type.label, { color: c.textMuted, marginBottom: Space.md }]}>{t("search.quickActions")}</Text>
      <View style={styles.quickActionsGrid}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.quickAction,
              {
                backgroundColor: c.card,
                borderColor: c.cardBorder,
                borderWidth: 1,
                borderRadius: Radius.lg,
                opacity: pressed ? 0.8 : 1,
                ...sh.card,
              },
            ]}
          >
            <View
              style={[
                styles.quickActionIcon,
                {
                  backgroundColor: action.color + "18",
                  borderRadius: Radius.md,
                },
              ]}
            >
              <action.icon size={20} color={action.color} strokeWidth={2} />
            </View>
            <Text
              style={[Type.caption, { color: c.text, marginTop: Space.sm, textAlign: "center" }]}
              numberOfLines={1}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ── Quick Note Sheet ────────────────────────────────────────────────────────

type QuickNoteActivityType = "call" | "text" | "showing" | "meeting" | "note";

const QUICK_NOTE_TYPE_KEYS: { key: QuickNoteActivityType; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "note", labelKey: "search.activityTypes.note", icon: "document-text" },
  { key: "call", labelKey: "search.activityTypes.call", icon: "call" },
  { key: "text", labelKey: "search.activityTypes.text", icon: "chatbubble-ellipses" },
  { key: "showing", labelKey: "search.activityTypes.showing", icon: "home" },
  { key: "meeting", labelKey: "search.activityTypes.meeting", icon: "people" },
];

function QuickNoteSheet({
  client,
  onClose,
  onSave,
  t,
}: {
  client: Client;
  onClose: () => void;
  onSave: (type: QuickNoteActivityType, description: string) => Promise<void>;
  t: (key: string) => string;
}) {
  const c = useColors();
  const [activityType, setActivityType] = useState<QuickNoteActivityType>("note");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timeout = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(timeout);
  }, []);

  const handleSave = async () => {
    if (!description.trim()) return;
    setSaving(true);
    await onSave(activityType, description);
    setSaving(false);
  };

  return (
    <Sheet visible onClose={onClose} title={t("search.quickNote")}>
      {/* Client name */}
      <View style={quickNoteStyles.clientRow}>
        <Ionicons name="person-circle" size={22} color={c.primary} />
        <Text style={[Type.bodyBold, { color: c.text, flex: 1 }]} numberOfLines={1}>
          {client.name}
        </Text>
      </View>

      {/* Activity type pills */}
      <View style={quickNoteStyles.typeRow}>
        {QUICK_NOTE_TYPE_KEYS.map((item) => {
          const isSelected = activityType === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setActivityType(item.key)}
              style={[
                quickNoteStyles.typeChip,
                {
                  backgroundColor: isSelected ? c.primaryDim : c.card,
                  borderColor: isSelected ? c.primaryBorder : c.cardBorder,
                },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={13}
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
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Note input */}
      <TextInput
        ref={inputRef}
        value={description}
        onChangeText={setDescription}
        placeholder={t("search.quickNotePlaceholder")}
        placeholderTextColor={c.textDim}
        multiline
        style={[
          Type.body,
          quickNoteStyles.noteInput,
          {
            color: c.text,
            backgroundColor: c.card,
            borderColor: c.cardBorder,
          },
        ]}
      />

      {/* Actions */}
      <View style={{ marginTop: Space.lg, gap: Space.sm }}>
        <Button
          label={saving ? t("search.saving") : t("search.save")}
          onPress={handleSave}
          loading={saving}
          disabled={!description.trim()}
          variant="primary"
        />
        <Pressable onPress={onClose} style={{ paddingVertical: Space.md }}>
          <Text style={[Type.bodyBold, { color: c.textMuted, textAlign: "center" }]}>
            {t("search.cancel")}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const quickNoteStyles = StyleSheet.create({
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginBottom: Space.lg,
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
    marginBottom: Space.lg,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    paddingHorizontal: Space.md,
    height: 34,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  noteInput: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 100,
    textAlignVertical: "top",
  },
});

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  input: {
    flex: 1,
    height: 48,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: Space.xs,
  },
  clearCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.lg,
    paddingTop: Space.xl,
    paddingBottom: Space.sm,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 56,
    gap: Space.md,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  dealIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 48,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Space.hero,
    paddingHorizontal: Space.xxxl,
  },
  quickActionsGrid: {
    flexDirection: "row",
    gap: Space.md,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Space.lg,
    paddingHorizontal: Space.sm,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  quickNoteBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});
