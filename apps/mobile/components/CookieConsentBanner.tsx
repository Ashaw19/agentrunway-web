/**
 * First-launch cookie consent banner — mobile counterpart to
 * `apps/web/components/cookie-consent.tsx`.
 *
 * Shows once until the user makes a choice. Both options must be equally
 * prominent (OPC guidance — no dark patterns). Choice persists in
 * AsyncStorage via the shared `cookie-consent` lib, identical key shape to
 * the web banner.
 *
 * See `memory/spec_runway_score_canonical_bands.md` style — shared lib +
 * thin surface. Behavior change today is zero (no trackers wired); the
 * banner exists for App Store nutrition labels + future-proofing.
 */

import { useEffect, useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Cookie } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useColors, Space, Radius, Type, shadows, useTheme } from "@/lib/theme";
import {
  getCookieConsent,
  setCookieConsent,
} from "@/lib/cookie-consent";

const PRIVACY_URL = "https://agentrunway.ca/privacy";

export function CookieConsentBanner() {
  const c = useColors();
  const { mode } = useTheme();
  const { t } = useTranslation("profile");

  // null = not yet checked (don't render), true = show, false = hide
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    const choice = getCookieConsent();
    setVisible(choice === null);
  }, []);

  if (visible !== true) return null;

  const dismiss = (choice: "accepted" | "declined") => {
    setCookieConsent(choice);
    setVisible(false);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: Space.xl,
        left: Space.lg,
        right: Space.lg,
      }}
    >
      <View
        style={[
          {
            backgroundColor: c.card,
            borderColor: c.cardBorder,
            borderWidth: 1,
            borderRadius: Radius.lg,
            padding: Space.lg,
            gap: Space.md,
          },
          shadows(mode).cardLg,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: Space.md }}>
          <Cookie size={20} color={c.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[Type.bodyBold, { color: c.text }]}>
              {t("cookieConsent.title")}
            </Text>
            <Text style={[Type.caption, { color: c.textMuted, lineHeight: 18 }]}>
              {t("cookieConsent.body")}{" "}
              <Text
                style={{ color: c.primary, textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(PRIVACY_URL)}
              >
                {t("cookieConsent.privacyLink")}
              </Text>
              .
            </Text>
          </View>
        </View>

        {/* OPC guidance — both options equally prominent */}
        <View style={{ flexDirection: "row", gap: Space.sm }}>
          <Pressable
            onPress={() => dismiss("declined")}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 40,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: c.cardBorder,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={[Type.bodyBold, { color: c.textSecondary }]}>
              {t("cookieConsent.decline")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => dismiss("accepted")}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 40,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: c.cardBorder,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={[Type.bodyBold, { color: c.text }]}>
              {t("cookieConsent.accept")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
