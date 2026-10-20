/**
 * Money: Expenses, Mileage and Forecast behind one control (2026-10-20; they
 * were three rows on More, and "Scan Receipt" was the whole Expenses page).
 * `/money?view=expenses|mileage|forecast` picks the view (lib/app-nav.ts);
 * `scan=1` opens the receipt camera once (the "+" sheet's Receipt).
 */
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Radius, Space, useColors } from "@/lib/theme";
import { useT } from "@/lib/useT";
import { MONEY_VIEWS, moneyView, type MoneyView } from "@/lib/app-nav";
import { TabHeader } from "@/components/nav/TabHeader";
import { AddButton } from "@/components/add/AddButton";
import ExpensesView from "@/components/money/ExpensesView";
import MileageView from "@/components/money/MileageView";
import ForecastView from "@/components/money/ForecastView";

export default function MoneyScreen() {
  const c = useColors();
  const router = useRouter();
  const { t } = useT("common");
  const params = useLocalSearchParams<{ view?: string; scan?: string }>();
  const view = moneyView(params.view);

  const select = (next: MoneyView) => {
    if (next === view) return;
    try { Haptics.selectionAsync(); } catch {}
    router.setParams({ view: next });
  };
  const scanHandled = useCallback(() => router.setParams({ scan: undefined }), [router]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <TabHeader title={t("tabs.money")}>
        <View
          accessibilityRole="tablist"
          style={{ flexDirection: "row", marginTop: Space.md, padding: 3, borderRadius: Radius.lg, backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder }}
        >
          {MONEY_VIEWS.map((key) => {
            const on = key === view;
            return (
              <Pressable
                key={key}
                onPress={() => select(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: Radius.md, backgroundColor: on ? c.primary : "transparent" }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: on ? "#FFFFFF" : c.textMuted }}>{t(`money.${key}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </TabHeader>
      <View style={{ flex: 1 }}>
        {view === "expenses" ? (
          <ExpensesView autoScan={params.scan === "1"} onAutoScanHandled={scanHandled} />
        ) : view === "mileage" ? (
          <MileageView />
        ) : (
          <ForecastView />
        )}
      </View>
      <AddButton />
    </SafeAreaView>
  );
}
