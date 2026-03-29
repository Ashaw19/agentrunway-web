/**
 * Notification Settings Screen
 * Toggle each notification type on/off. Set quiet hours.
 * All 5 types are opportunity-based, never guilt-based.
 */

import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Switch,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Sun,
  Zap,
  UserCheck,
  Target,
  BarChart3,
  Moon,
  BellOff,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  useColors,
  useTheme,
  shadows,
  Space,
  Radius,
  Type,
} from "@/lib/theme";
import {
  type NotificationPreferences,
  getNotificationPreferences,
  saveNotificationPreferences,
  registerForPushNotifications,
} from "@/lib/notifications";

interface NotifType {
  key: keyof NotificationPreferences;
  icon: typeof Sun;
  color: string;
  label: string;
  description: string;
}

const NOTIFICATION_TYPES: NotifType[] = [
  {
    key: "morning_briefing",
    icon: Sun,
    color: "#F0A800",
    label: "Morning Briefing",
    description:
      "Daily 8am summary: follow-ups due, tasks, pipeline movement, birthdays",
  },
  {
    key: "hot_lead_alert",
    icon: Zap,
    color: "#EF4444",
    label: "Hot Lead Alert",
    description:
      "Instant alert when a pipeline deal advances stage or a high-value lead comes in",
  },
  {
    key: "follow_up_due",
    icon: UserCheck,
    color: "#3B5EF6",
    label: "Follow-Up Reminder",
    description:
      "Gentle nudge for high-priority clients approaching 14 days without contact",
  },
  {
    key: "deal_milestone",
    icon: Target,
    color: "#10B981",
    label: "Deal Milestone",
    description:
      "Deadline alerts: inspection periods, condition dates, closing dates",
  },
  {
    key: "afternoon_recap",
    icon: BarChart3,
    color: "#8B5CF6",
    label: "Afternoon Recap",
    description:
      "4pm wrap-up: activities logged today, clients who still need attention",
  },
];

export default function NotificationSettingsScreen() {
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(true);

  useEffect(() => {
    (async () => {
      const p = await getNotificationPreferences();
      setPrefs(p);
      setLoading(false);

      // Attempt to register for push (will request permission if needed)
      if (Platform.OS !== "web") {
        const token = await registerForPushNotifications();
        if (!token) {
          setPermissionGranted(false);
        }
      }
    })();
  }, []);

  const handleToggle = async (
    key: keyof NotificationPreferences,
    value: boolean
  ) => {
    if (!prefs) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    const updated = { ...prefs, [key]: value };
    setPrefs(updated);

    const ok = await saveNotificationPreferences({ [key]: value });
    if (!ok) {
      // Rollback on failure
      setPrefs(prefs);
      Alert.alert("Error", "Failed to update preference. Try again.");
    }
  };

  if (loading || !prefs) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: c.bg }}
        edges={["bottom"]}
      >
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ ...Type.body, color: c.textDim }}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["bottom"]}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Space.xl,
          paddingBottom: 100,
          paddingTop: Space.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Permission Warning ── */}
        {!permissionGranted && Platform.OS !== "web" && (
          <View
            style={{
              backgroundColor: c.warningDim,
              borderRadius: Radius.lg,
              padding: Space.lg,
              marginBottom: Space.xxl,
              borderWidth: 1,
              borderColor: "#F59E0B" + "30",
              flexDirection: "row",
              alignItems: "center",
              gap: Space.md,
            }}
          >
            <BellOff size={20} color="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={{ ...Type.bodyBold, color: "#F59E0B" }}>
                Notifications Disabled
              </Text>
              <Text
                style={{ ...Type.caption, color: c.textSecondary, marginTop: 2 }}
              >
                Enable notifications in your device settings to receive alerts.
              </Text>
            </View>
          </View>
        )}

        {/* ── Web Info ── */}
        {Platform.OS === "web" && (
          <View
            style={{
              backgroundColor: c.primaryDim,
              borderRadius: Radius.lg,
              padding: Space.lg,
              marginBottom: Space.xxl,
              borderWidth: 1,
              borderColor: c.primaryBorder,
            }}
          >
            <Text
              style={{
                ...Type.caption,
                color: c.primaryLight,
                textAlign: "center",
              }}
            >
              Push notifications are available on the native iOS and Android app.
              Configure your preferences here — they'll be active when you
              install the app.
            </Text>
          </View>
        )}

        {/* ── Notification Types ── */}
        <Text
          style={{
            ...Type.label,
            color: c.textMuted,
            marginBottom: Space.md,
          }}
        >
          NOTIFICATION TYPES
        </Text>
        <View
          style={[
            {
              backgroundColor: c.card,
              borderRadius: Radius.xl,
              borderWidth: 1,
              borderColor: c.cardBorder,
              overflow: "hidden",
            },
            sh.card,
          ]}
        >
          {NOTIFICATION_TYPES.map((notif, idx) => {
            const Icon = notif.icon;
            const isEnabled = prefs[notif.key] as boolean;
            return (
              <View key={notif.key}>
                {idx > 0 && (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: c.cardBorder,
                      marginLeft: 40 + Space.md + Space.lg,
                    }}
                  />
                )}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: Space.lg,
                    gap: Space.md,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: Radius.md,
                      backgroundColor: notif.color + "15",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={20} color={notif.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...Type.bodyBold, color: c.text }}>
                      {notif.label}
                    </Text>
                    <Text
                      style={{
                        ...Type.caption,
                        color: c.textDim,
                        marginTop: 2,
                      }}
                    >
                      {notif.description}
                    </Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    onValueChange={(v) => handleToggle(notif.key, v)}
                    trackColor={{
                      false: c.textFaint,
                      true: notif.color + "60",
                    }}
                    thumbColor={isEnabled ? notif.color : c.textDim}
                    ios_backgroundColor={c.textFaint}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Quiet Hours ── */}
        <Text
          style={{
            ...Type.label,
            color: c.textMuted,
            marginTop: Space.section,
            marginBottom: Space.md,
          }}
        >
          QUIET HOURS
        </Text>
        <View
          style={[
            {
              backgroundColor: c.card,
              borderRadius: Radius.xl,
              borderWidth: 1,
              borderColor: c.cardBorder,
              padding: Space.xl,
            },
            sh.card,
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: Space.md,
              marginBottom: Space.lg,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: Radius.md,
                backgroundColor: "#6B7280" + "15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Moon size={20} color="#6B7280" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...Type.bodyBold, color: c.text }}>
                {prefs.quiet_hours_start} — {prefs.quiet_hours_end}
              </Text>
              <Text
                style={{
                  ...Type.caption,
                  color: c.textDim,
                  marginTop: 2,
                }}
              >
                No notifications during these hours
              </Text>
            </View>
          </View>

          <View
            style={{
              backgroundColor: c.primaryDim,
              borderRadius: Radius.md,
              padding: Space.md,
              borderWidth: 1,
              borderColor: c.primaryBorder,
            }}
          >
            <Text
              style={{
                ...Type.caption,
                color: c.primaryLight,
                textAlign: "center",
              }}
            >
              Quiet hours can be customized on the web dashboard.
            </Text>
          </View>
        </View>

        {/* ── Philosophy ── */}
        <View
          style={{
            marginTop: Space.xxl,
            backgroundColor: c.primaryDim,
            borderRadius: Radius.lg,
            padding: Space.lg,
            borderWidth: 1,
            borderColor: c.primaryBorder,
          }}
        >
          <Text
            style={{
              ...Type.caption,
              color: c.primaryLight,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            Agent Runway sends 2-5 notifications per day, all connected to
            revenue opportunities. We never send guilt-based reminders or
            engagement bait.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
