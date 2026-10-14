/**
 * Storage abstraction layer.
 *
 * Uses AsyncStorage (compatible with Expo Go) instead of MMKV
 * (which requires a custom dev client / new architecture).
 *
 * Provides both a sync-like `storage` API (caches values in memory)
 * and a Zustand `StateStorage` adapter.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StateStorage } from "zustand/middleware";

const STORE_ID = "agent-runway";

// In-memory cache so reads can be synchronous after init
const cache = new Map<string, string>();
let _initialized = false;
let _initPromise: Promise<void> | null = null;
// Keys written or deleted this session before init finished: init must not
// put the older value on disk back over them.
const touchedBeforeInit = new Set<string>();

/** True once initStorage has loaded saved values into memory. */
export function isStorageReady(): boolean {
  return _initialized;
}

/**
 * Loads every saved key into the in-memory cache. Until it resolves, every
 * synchronous read returns undefined, so the app calls it (through
 * lib/storage-bootstrap.ts) before rendering, and stores that read storage
 * when their module loads re-read it afterwards (their `hydrate`).
 * Safe to call more than once: later calls share the first load.
 */
export function initStorage(): Promise<void> {
  if (!_initPromise) {
    _initPromise = (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const prefixedKeys = keys.filter((k) => k.startsWith(`${STORE_ID}:`));
        if (prefixedKeys.length > 0) {
          const pairs = await AsyncStorage.multiGet(prefixedKeys);
          for (const [key, value] of pairs) {
            const name = key.replace(`${STORE_ID}:`, "");
            if (value != null && !touchedBeforeInit.has(name)) {
              cache.set(name, value);
            }
          }
        }
      } catch (e) {
        console.warn("[storage] Failed to initialize cache:", e);
      }
      _initialized = true;
      touchedBeforeInit.clear();
    })();
  }
  return _initPromise;
}

function prefixed(key: string) {
  return `${STORE_ID}:${key}`;
}

/**
 * Synchronous-like storage API (reads from in-memory cache).
 * Writes are fire-and-forget to AsyncStorage.
 */
export const storage = {
  getString(key: string): string | undefined {
    return cache.get(key);
  },

  getNumber(key: string): number | undefined {
    const v = cache.get(key);
    if (v == null) return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  },

  getBoolean(key: string): boolean | undefined {
    const v = cache.get(key);
    if (v == null) return undefined;
    return v === "true";
  },

  set(key: string, value: string | number | boolean) {
    const str = String(value);
    if (!_initialized) touchedBeforeInit.add(key);
    cache.set(key, str);
    AsyncStorage.setItem(prefixed(key), str).catch((e) =>
      console.warn("[storage] write failed:", key, e),
    );
  },

  delete(key: string) {
    if (!_initialized) touchedBeforeInit.add(key);
    cache.delete(key);
    AsyncStorage.removeItem(prefixed(key)).catch((e) =>
      console.warn("[storage] delete failed:", key, e),
    );
  },
};

// Zustand persist adapter for AsyncStorage (async, which Zustand supports)
export const mmkvStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    // Try in-memory cache first
    const cached = cache.get(name);
    if (cached != null) return cached;
    // Fall back to AsyncStorage
    try {
      const value = await AsyncStorage.getItem(prefixed(name));
      if (value != null) cache.set(name, value);
      return value;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    cache.set(name, value);
    await AsyncStorage.setItem(prefixed(name), value);
  },
  removeItem: async (name: string): Promise<void> => {
    cache.delete(name);
    await AsyncStorage.removeItem(prefixed(name));
  },
};
