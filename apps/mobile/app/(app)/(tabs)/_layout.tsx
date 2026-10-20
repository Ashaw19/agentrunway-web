import { useMemo } from "react";
import { NativeTabs, Icon, Label, Badge } from "expo-router/unstable-native-tabs";
import { useColors } from "@/lib/theme";
import { useDataStore } from "@/stores/data-store";
import { useT } from "@/lib/useT";
import { tabBadge } from "@/lib/app-nav";

/**
 * The system tab bar (Liquid Glass on iOS 26): four places and Search.
 *
 * Apple's guidance: a tab bar only navigates, and Search sits apart at the
 * trailing end (role "search"). Adding things is the "+" on each tab
 * (components/add), settings open from your initials on Today. See
 * docs/superpowers/specs/2026-10-20-phone-navigation-design.md.
 */
export default function TabsLayout() {
  const c = useColors();
  const { t } = useT("common");
  const { tasks, transactions, pipeline, smartListCounts, clients } = useDataStore();

  const counts = useMemo(() => smartListCounts(), [clients, pipeline]);

  const overdueCount = useMemo(() => {
    const today = new Date(new Date().toDateString());
    // Local-noon anchor: `due_date` is date-only; parsed bare it lands on the
    // previous day locally, so every task due TODAY inflated this badge.
    return tasks.filter((task) => task.due_date && new Date(task.due_date + "T12:00:00") < today && !task.completed_at).length;
  }, [tasks]);

  const pendingCount = useMemo(
    () => transactions.filter((tx) => tx.status === "pending").length + counts.hotPipeline,
    [transactions, counts.hotPipeline],
  );

  const followUpCount = counts.overdueFollowups + counts.uncontactedLeads;

  return (
    <NativeTabs tintColor={c.primary} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <Label>{t("tabs.today")}</Label>
        <Icon sf={{ default: "sun.max", selected: "sun.max.fill" }} />
        <Badge hidden={!tabBadge(overdueCount)}>{tabBadge(overdueCount)}</Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clients">
        <Label>{t("tabs.clients")}</Label>
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Badge hidden={!tabBadge(followUpCount)}>{tabBadge(followUpCount)}</Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="deals">
        <Label>{t("tabs.deals")}</Label>
        <Icon sf={{ default: "briefcase", selected: "briefcase.fill" }} />
        <Badge hidden={!tabBadge(pendingCount)}>{tabBadge(pendingCount)}</Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="money">
        <Label>{t("tabs.money")}</Label>
        <Icon sf={{ default: "dollarsign.circle", selected: "dollarsign.circle.fill" }} />
      </NativeTabs.Trigger>
      {/* The system's own Search item: its icon, its localized title, set apart at the end. */}
      <NativeTabs.Trigger name="search" role="search" />
    </NativeTabs>
  );
}
