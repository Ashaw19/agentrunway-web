/**
 * Legal & Privacy screen — mobile counterpart to the web footer's legal
 * cluster (`/privacy`, `/terms`, `/cookie-policy`, `/acceptable-use`).
 *
 * Each row opens the corresponding canonical web page in the system in-app
 * browser via `expo-web-browser`. That keeps the legal copy in exactly one
 * place (`apps/web/app/{privacy,terms,cookie-policy,acceptable-use}/page.tsx`)
 * so a counsel edit on web is automatically reflected on mobile — no fork.
 *
 * App Store compliance note: Apple's privacy nutrition label requires a
 * link to the privacy policy that's reachable from inside the app. This
 * screen is the canonical entry point.
 *
 * Quebec posture: the underlying web pages are publicly served and not
 * geo-blocked (only `/(app)` routes are). No mobile-side QC variant is
 * built per Andrew's 2026-05-26 directive
 * (`memory/project_mobile_parity_audit_2026-05-26.md`).
 *
 * Cookie-consent re-review: surfaces the current persisted choice
 * (`ar-cookie-consent` key — identical to web) and lets the user change it
 * here.
 */

import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import {
  Shield,
  FileText,
  Cookie,
  ShieldAlert,
  ExternalLink,
  Check,
  X,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useColors, Space, Radius, Type } from "@/lib/theme";
import { Card } from "@/components/ui";
import {
  getCookieConsent,
  setCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";

const BASE_URL = "https://agentrunway.ca";

type LegalLink = {
  key: "privacy" | "terms" | "cookiePolicy" | "acceptableUse";
  path: string;
  icon: React.ComponentType<{ size: number; color: string }>;
};

const LINKS: LegalLink[] = [
  { key: "privacy",       path: "/privacy",        icon: Shield },
  { key: "terms",         path: "/terms",          icon: FileText },
  { key: "cookiePolicy",  path: "/cookie-policy",  icon: Cookie },
  { key: "acceptableUse", path: "/acceptable-use", icon: ShieldAlert },
];

export default function LegalScreen() {
  const c = useColors();
  const { t } = useTranslation("profile");

  const [consent, setConsent] = useState<CookieConsentChoice>(null);

  useEffect(() => {
    setConsent(getCookieConsent());
  }, []);

  const openLink = async (path: string) => {
    try {
      await WebBrowser.openBrowserAsync(`${BASE_URL}${path}`);
    } catch (err) {
      console.warn("[legal] failed to open browser:", err);
      Alert.alert(t("legal.openErrorTitle"), t("legal.openErrorBody"));
    }
  };

  const updateConsent = (choice: "accepted" | "declined") => {
    setCookieConsent(choice);
    setConsent(choice);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{
          padding: Space.xl,
          gap: Space.lg,
          paddingBottom: Space.xxl,
        }}
      >
        {/* Header */}
        <View style={{ gap: Space.xs }}>
          <Text style={[Type.h1, { color: c.text }]}>{t("legal.title")}</Text>
          <Text style={[Type.body, { color: c.textMuted }]}>
            {t("legal.subtitle")}
          </Text>
        </View>

        {/* Legal links */}
        <Card>
          {LINKS.map((link, idx) => {
            const Icon = link.icon;
            return (
              <View key={link.key}>
                {idx > 0 && (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: c.cardBorder,
                      marginVertical: Space.sm,
                    }}
                  />
                )}
                <Pressable
                  onPress={() => openLink(link.path)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Space.md,
                    paddingVertical: Space.md,
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityRole="link"
                  accessibilityLabel={t(`legal.links.${link.key}.label`)}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: Radius.md,
                      backgroundColor: c.primaryDim,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={18} color={c.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[Type.bodyBold, { color: c.text }]}>
                      {t(`legal.links.${link.key}.label`)}
                    </Text>
                    <Text style={[Type.caption, { color: c.textMuted }]}>
                      {t(`legal.links.${link.key}.description`)}
                    </Text>
                  </View>
                  <ExternalLink size={16} color={c.textMuted} />
                </Pressable>
              </View>
            );
          })}
        </Card>

        {/* Cookie consent re-review */}
        <View style={{ gap: Space.xs, marginTop: Space.sm }}>
          <Text style={[Type.label, { color: c.textMuted }]}>
            {t("legal.consent.section")}
          </Text>
        </View>
        <Card>
          <View style={{ gap: Space.md }}>
            <View style={{ gap: 4 }}>
              <Text style={[Type.bodyBold, { color: c.text }]}>
                {t("legal.consent.title")}
              </Text>
              <Text style={[Type.caption, { color: c.textMuted, lineHeight: 18 }]}>
                {t("legal.consent.description")}
              </Text>
            </View>

            <Text style={[Type.caption, { color: c.textMuted }]}>
              {t("legal.consent.statusLabel")}:{" "}
              <Text style={{ color: c.text, fontWeight: "700" }}>
                {consent === "accepted"
                  ? t("legal.consent.statusAccepted")
                  : consent === "declined"
                    ? t("legal.consent.statusDeclined")
                    : t("legal.consent.statusUnset")}
              </Text>
            </Text>

            <View style={{ flexDirection: "row", gap: Space.sm }}>
              <Pressable
                onPress={() => updateConsent("declined")}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 40,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: Space.xs,
                  borderRadius: Radius.md,
                  borderWidth: 1,
                  borderColor:
                    consent === "declined" ? c.primary : c.cardBorder,
                  backgroundColor:
                    consent === "declined" ? c.primaryDim : "transparent",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <X size={14} color={consent === "declined" ? c.primary : c.textSecondary} />
                <Text
                  style={[
                    Type.bodyBold,
                    {
                      color:
                        consent === "declined" ? c.primary : c.textSecondary,
                    },
                  ]}
                >
                  {t("legal.consent.decline")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => updateConsent("accepted")}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 40,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: Space.xs,
                  borderRadius: Radius.md,
                  borderWidth: 1,
                  borderColor:
                    consent === "accepted" ? c.primary : c.cardBorder,
                  backgroundColor:
                    consent === "accepted" ? c.primaryDim : "transparent",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Check size={14} color={consent === "accepted" ? c.primary : c.text} />
                <Text
                  style={[
                    Type.bodyBold,
                    {
                      color: consent === "accepted" ? c.primary : c.text,
                    },
                  ]}
                >
                  {t("legal.consent.accept")}
                </Text>
              </Pressable>
            </View>
          </View>
        </Card>

        <Text
          style={[
            Type.micro,
            {
              color: c.textFaint,
              textAlign: "center",
              fontStyle: "italic",
              marginTop: Space.lg,
            },
          ]}
        >
          {t("legal.footer")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
