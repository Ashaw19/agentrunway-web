/**
 * The "+" on Today, Clients, Deals and Money: one place to add anything
 * (Things 3's Magic Plus; Follow Up Boss's quick actions). It floats bottom
 * right, clear of the tab bar, and opens the Add sheet:
 *   - Voice note: hold to talk, right in the sheet; the note is reviewed on
 *     its card before anything is saved (VoiceCaptureSheet)
 *   - Log a call or text: the quick-log form (QuickCaptureSheet)
 *   - Receipt, Trip, Client, Deal: open that form or screen (ADD_TARGET)
 *
 * iOS shows one sheet at a time, so the next sheet or screen opens once the
 * Add sheet has gone (its onDismiss, iOS only; elsewhere it opens at once). `onOpenChange` tells a host screen
 * that a sheet of ours is up (the dashboard holds its after-call question).
 */
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Briefcase, Camera, Car, Phone, Plus, UserPlus } from "lucide-react-native";
import type { CaptureProposal } from "@agent-runway/core/lib/capture/types";
import { useColors, useTheme, shadows, Space, Radius, Type } from "@/lib/theme";
import { useT } from "@/lib/useT";
import { ADD_TARGET, type AddAction } from "@/lib/app-nav";
import { Sheet } from "@/components/ui/Sheet";
import { VoiceCaptureButton } from "@/components/voice/VoiceCaptureButton";
import { VoiceCaptureSheet } from "@/components/voice/VoiceCaptureSheet";
import { QuickCaptureSheet } from "./QuickCaptureSheet";

export const ADD_BUTTON_SIZE = 56;
/** Above the tab bar (iOS 26's floating bar, plus its gap). */
export const ADD_BUTTON_ABOVE_TABS = 64;

/** Bottom padding a scrolling list needs so its last row scrolls clear of the "+". */
export function addButtonClearance(bottomInset: number): number {
  return bottomInset + ADD_BUTTON_ABOVE_TABS + ADD_BUTTON_SIZE + Space.lg;
}

/** The same, for a list inside a SafeAreaView (which already keeps the bottom inset). */
export const ADD_CLEARANCE = addButtonClearance(0);

type Next = { kind: "log" } | { kind: "voice"; proposal: CaptureProposal } | { kind: "go"; href: string } | null;

const TILES: { action: Exclude<AddAction, "voice" | "log">; Icon: typeof Phone }[] = [
  { action: "receipt", Icon: Camera },
  { action: "trip", Icon: Car },
  { action: "client", Icon: UserPlus },
  { action: "deal", Icon: Briefcase },
];

export function AddButton({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useT("common");

  const [menu, setMenu] = useState(false);
  const [next, setNext] = useState<Next>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [proposal, setProposal] = useState<CaptureProposal | null>(null);

  useEffect(() => {
    onOpenChange?.(menu || logOpen || !!proposal);
  }, [menu, logOpen, proposal, onOpenChange]);

  const open = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setMenu(true);
  };

  const run = useCallback((picked: Next) => {
    if (!picked) return;
    if (picked.kind === "log") setLogOpen(true);
    else if (picked.kind === "voice") setProposal(picked.proposal);
    else router.push(picked.href as never);
  }, [router]);

  const pick = (picked: Next) => {
    setMenu(false);
    if (Platform.OS === "ios") setNext(picked);
    else run(picked);
  };

  const choose = (action: Exclude<AddAction, "voice" | "log">) => pick({ kind: "go", href: ADD_TARGET[action] });

  // The Add sheet has gone (iOS): open what was picked.
  const afterMenu = useCallback(() => {
    run(next);
    setNext(null);
  }, [next, run]);

  return (
    <>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={t("add.title")}
        style={({ pressed }) => [
          {
            position: "absolute",
            right: Space.xl,
            bottom: insets.bottom + ADD_BUTTON_ABOVE_TABS,
            width: ADD_BUTTON_SIZE,
            height: ADD_BUTTON_SIZE,
            borderRadius: ADD_BUTTON_SIZE / 2,
            backgroundColor: c.primary,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            ...sh.cardLg,
          },
          pressed && { opacity: 0.85, transform: [{ scale: 0.94 }] },
        ]}
      >
        <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
      </Pressable>

      <Sheet visible={menu} onClose={() => setMenu(false)} onDismiss={afterMenu} title={t("add.title")}>
        <View style={{ gap: Space.md, paddingBottom: Space.md }}>
          <VoiceCaptureButton
            variant="inline"
            onProposal={(p) => pick({ kind: "voice", proposal: p })}
          />
          <Pressable
            onPress={() => pick({ kind: "log" })}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: Space.sm,
              padding: Space.md,
              borderRadius: Radius.lg,
              borderWidth: 1,
              borderColor: c.cardBorder,
              backgroundColor: pressed ? c.primaryDim : c.card,
            })}
          >
            <View style={{ width: 32, height: 32, borderRadius: Radius.md, backgroundColor: c.primaryDim, alignItems: "center", justifyContent: "center" }}>
              <Phone size={17} color={c.primary} strokeWidth={2} />
            </View>
            <Text style={{ ...Type.bodyBold, color: c.text }}>{t("add.log")}</Text>
          </Pressable>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
            {TILES.map(({ action, Icon }) => (
              <Pressable
                key={action}
                onPress={() => choose(action)}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  width: "48.5%",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Space.sm,
                  padding: Space.md,
                  borderRadius: Radius.lg,
                  borderWidth: 1,
                  borderColor: c.cardBorder,
                  backgroundColor: pressed ? c.primaryDim : c.card,
                })}
              >
                <View style={{ width: 32, height: 32, borderRadius: Radius.md, backgroundColor: c.primaryDim, alignItems: "center", justifyContent: "center" }}>
                  <Icon size={17} color={c.primary} strokeWidth={2} />
                </View>
                <Text style={{ ...Type.bodyBold, color: c.text, flexShrink: 1 }} numberOfLines={2}>
                  {t(`add.${action}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Sheet>

      <QuickCaptureSheet visible={logOpen} onClose={() => setLogOpen(false)} />
      <VoiceCaptureSheet proposal={proposal} onClose={() => setProposal(null)} />
    </>
  );
}
