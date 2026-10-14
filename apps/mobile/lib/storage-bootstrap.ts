/**
 * App startup: load saved storage, then let everything that read it too early
 * read it again.
 *
 * `storage` (lib/mmkv.ts) answers synchronously from an in-memory copy that
 * initStorage fills from AsyncStorage. The theme, language, data cache,
 * offline queue and Flight Crew chat all read storage when their modules
 * load, which is before that copy exists, so each has a hydrate step that
 * re-reads it here. Until 2026-10-14 initStorage was never called: every
 * launch forgot the privacy choice, theme, language and chat, emptied the
 * offline cache, and lost writes queued offline before a restart.
 *
 * app/_layout.tsx keeps the splash screen up until this resolves.
 */
import { initStorage, isStorageReady } from "./mmkv";
import { hydrateTheme } from "./theme";
import { hydrateLanguage } from "./i18n";
import { useDataStore } from "../stores/data-store";
import { useOfflineQueueStore } from "../stores/offline-queue";
import { useChatStore } from "../stores/chat-store";

/** Longest the splash waits for storage; past it the app opens without saved values. */
const STORAGE_TIMEOUT_MS = 4000;

let hydrated = false;

function hydrateAll(): void {
  if (hydrated) return;
  hydrated = true;
  const steps: [string, () => void][] = [
    ["theme", hydrateTheme],
    ["language", hydrateLanguage],
    ["data cache", () => useDataStore.getState().hydrate()],
    ["offline queue", () => useOfflineQueueStore.getState().hydrate()],
    ["chat", () => useChatStore.getState().hydrate()],
  ];
  for (const [name, step] of steps) {
    try {
      step();
    } catch (e) {
      console.warn(`[storage] Couldn't restore ${name}:`, e);
    }
  }
}

/**
 * Resolves once saved values are loaded and restored, or after
 * STORAGE_TIMEOUT_MS. If storage is slower than that, the stores still
 * restore when it finishes.
 */
export async function bootstrapStorage(): Promise<void> {
  const loaded = initStorage().then(hydrateAll);
  await Promise.race([
    loaded,
    new Promise<void>((resolve) => setTimeout(resolve, STORAGE_TIMEOUT_MS)),
  ]);
}

export { isStorageReady };
