/**
 * The app's real dependencies for sendQueuedText (lib/send-queued-text.ts):
 * the signed-in session's token, fetch, expo-sms, the data store's
 * markTexted and queue, and native alerts. The Outreach screen and the
 * dashboard's Text button both pass these, so a text goes out the same way
 * from either.
 */

import { Alert } from "react-native";
import * as SMS from "expo-sms";
import { supabase } from "./supabase";
import { useDataStore } from "../stores/data-store";
import type { SendQueuedTextDeps } from "./send-queued-text";

export function queuedTextDeps(): SendQueuedTextDeps {
  return {
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    fetchFn: fetch,
    sms: SMS,
    markTexted: (id, body) => useDataStore.getState().markTexted(id, body),
    alert: (title, message) => Alert.alert(title, message),
    dropFromQueue: (id) => {
      const queue = useDataStore.getState().outreachQueue.filter((q) => q.id !== id);
      useDataStore.setState({
        outreachQueue: queue,
        outreachReadyCount: queue.filter((q) => q.status === "ready").length,
      });
    },
    ask: (title, message, yes, no) =>
      new Promise<boolean>((resolve) => {
        Alert.alert(
          title,
          message,
          [
            { text: no, style: "cancel", onPress: () => resolve(false) },
            { text: yes, onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
  };
}
