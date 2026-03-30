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

/**
 * Must be called once at app start (before stores read from storage).
 * Loads all keys into the in-memory cache.
 */
export async function initStorage(): Promise<void> {
  if (_initialized) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefixedKeys = keys.filter((k) => k.startsWith(`${STORE_ID}:`));
    if (prefixedKeys.length > 0) {
      const pairs = await AsyncStorage.multiGet(prefixedKeys);
      for (const [key, value] of pairs) {
        if (value != null) {
          cache.set(key.replace(`${STORE_ID}:`, ""), value);
        }
      }
    }
  } catch (e) {
    console.warn("[storage] Failed to initialize cache:", e);
  }
  _initialized = true;
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
    cache.set(key, str);
    AsyncStorage.setItem(prefixed(key), str).catch((e) =>
      console.warn("[storage] write failed:", key, e),
    );
  },

  delete(key: string) {
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
