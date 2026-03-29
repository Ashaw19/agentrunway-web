/**
 * Network connectivity listener hook.
 *
 * Monitors online/offline state via browser events (web export compatible).
 * Automatically triggers offline queue processing when connectivity returns.
 */

import { useEffect } from "react";
import { useOfflineQueueStore } from "../stores/offline-queue";

export function useNetworkStatus() {
  useEffect(() => {
    const { setOnline, processQueue } = useOfflineQueueStore.getState();

    const handleOnline = () => {
      useOfflineQueueStore.getState().setOnline(true);
      useOfflineQueueStore.getState().processQueue();
    };

    const handleOffline = () => {
      useOfflineQueueStore.getState().setOnline(false);
    };

    try {
      // Check initial state
      if (typeof navigator !== "undefined" && navigator.onLine !== undefined) {
        setOnline(navigator.onLine);
        // If we come online and have pending items, process them
        if (navigator.onLine) {
          processQueue();
        }
      }

      // Listen for connectivity changes
      if (typeof window !== "undefined") {
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
      }
    } catch {
      // SSR safety — ignore if window/navigator not available
    }

    return () => {
      try {
        if (typeof window !== "undefined") {
          window.removeEventListener("online", handleOnline);
          window.removeEventListener("offline", handleOffline);
        }
      } catch {
        // SSR safety
      }
    };
  }, []);
}
