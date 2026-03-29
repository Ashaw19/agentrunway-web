/**
 * Push Notification Setup — Agent Runway Mobile
 *
 * Handles permission requests, token registration with Supabase,
 * and notification channel configuration.
 * Uses Expo Notifications for native iOS/Android push.
 */

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// ── Notification Behavior ───────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Android Channel ──────────────────────────────────────────────────────────

async function setupAndroidChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Agent Runway",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3B5EF6",
      sound: "default",
    });

    await Notifications.setNotificationChannelAsync("morning-briefing", {
      name: "Morning Briefing",
      importance: Notifications.AndroidImportance.HIGH,
      description: "Daily summary of your tasks, follow-ups, and pipeline",
      sound: "default",
    });

    await Notifications.setNotificationChannelAsync("deal-alerts", {
      name: "Deal Alerts",
      importance: Notifications.AndroidImportance.MAX,
      description: "Hot lead alerts and deal milestone notifications",
      sound: "default",
    });
  }
}

// ── Token Registration ──────────────────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications require a physical device
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Web doesn't use Expo push tokens
  if (Platform.OS === "web") {
    return null;
  }

  await setupAndroidChannel();

  // Check existing permission
  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission not granted");
    return null;
  }

  // Get Expo push token
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenResponse.data;

    // Register token with Supabase
    await saveTokenToSupabase(token);

    return token;
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }
}

// ── Save Token to Supabase ──────────────────────────────────────────────────

async function saveTokenToSupabase(token: string) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Upsert — one token per user per device
    await supabase.from("push_tokens").upsert(
      {
        user_id: user.id,
        expo_push_token: token,
        device_name: Device.deviceName ?? `${Platform.OS} device`,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,expo_push_token",
      }
    );
  } catch (error) {
    console.error("Error saving push token:", error);
  }
}

// ── Remove Token ────────────────────────────────────────────────────────────

export async function unregisterPushToken() {
  try {
    if (Platform.OS === "web" || !Device.isDevice) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("expo_push_token", tokenResponse.data);
  } catch (error) {
    console.error("Error removing push token:", error);
  }
}

// ── Notification Preferences ────────────────────────────────────────────────

export interface NotificationPreferences {
  morning_briefing: boolean;
  hot_lead_alert: boolean;
  follow_up_due: boolean;
  deal_milestone: boolean;
  afternoon_recap: boolean;
  quiet_hours_start: string; // "22:00"
  quiet_hours_end: string; // "07:00"
}

const DEFAULT_PREFS: NotificationPreferences = {
  morning_briefing: true,
  hot_lead_alert: true,
  follow_up_due: true,
  deal_milestone: true,
  afternoon_recap: true,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return DEFAULT_PREFS;

    const { data } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!data) return DEFAULT_PREFS;

    return {
      morning_briefing: data.morning_briefing ?? true,
      hot_lead_alert: data.hot_lead_alert ?? true,
      follow_up_due: data.follow_up_due ?? true,
      deal_milestone: data.deal_milestone ?? true,
      afternoon_recap: data.afternoon_recap ?? true,
      quiet_hours_start: data.quiet_hours_start ?? "22:00",
      quiet_hours_end: data.quiet_hours_end ?? "07:00",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveNotificationPreferences(
  prefs: Partial<NotificationPreferences>
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from("notification_preferences").upsert(
      {
        user_id: user.id,
        ...prefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    return !error;
  } catch {
    return false;
  }
}

// ── Notification Listeners ──────────────────────────────────────────────────

export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

// ── Schedule Local Notification (for testing) ───────────────────────────────

export async function scheduleTestNotification() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Agent Runway",
      body: "3 follow-ups due today, 1 birthday, and a deal at conditional stage.",
      data: { screen: "dashboard" },
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
    },
  });
}
