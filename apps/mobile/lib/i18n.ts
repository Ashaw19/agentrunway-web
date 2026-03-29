/**
 * i18next configuration for Agent Runway mobile app.
 *
 * - Detects device locale via expo-localization
 * - Loads translations from @agent-runway/i18n (shared workspace package)
 * - Persists user-chosen language to MMKV
 * - Falls back to English
 *
 * Import this file for side-effect initialization in the root layout.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import { getClosestLocale, type SupportedLocale } from "@agent-runway/i18n";
import { storage } from "./mmkv";

// ── Translation Resources ────────────────────────────────────────────────────
// Statically imported so Metro can bundle them.

import enCommon from "@agent-runway/i18n/mobile/en/common.json";
import enHome from "@agent-runway/i18n/mobile/en/home.json";
import enClients from "@agent-runway/i18n/mobile/en/clients.json";
import enDeals from "@agent-runway/i18n/mobile/en/deals.json";
import enProfile from "@agent-runway/i18n/mobile/en/profile.json";
import enAuth from "@agent-runway/i18n/mobile/en/auth.json";

import frCommon from "@agent-runway/i18n/mobile/fr-CA/common.json";
import frHome from "@agent-runway/i18n/mobile/fr-CA/home.json";
import frClients from "@agent-runway/i18n/mobile/fr-CA/clients.json";
import frDeals from "@agent-runway/i18n/mobile/fr-CA/deals.json";
import frProfile from "@agent-runway/i18n/mobile/fr-CA/profile.json";
import frAuth from "@agent-runway/i18n/mobile/fr-CA/auth.json";

import zhCommon from "@agent-runway/i18n/mobile/zh/common.json";
import zhHome from "@agent-runway/i18n/mobile/zh/home.json";
import zhClients from "@agent-runway/i18n/mobile/zh/clients.json";
import zhDeals from "@agent-runway/i18n/mobile/zh/deals.json";
import zhProfile from "@agent-runway/i18n/mobile/zh/profile.json";
import zhAuth from "@agent-runway/i18n/mobile/zh/auth.json";

import paCommon from "@agent-runway/i18n/mobile/pa/common.json";
import paHome from "@agent-runway/i18n/mobile/pa/home.json";
import paClients from "@agent-runway/i18n/mobile/pa/clients.json";
import paDeals from "@agent-runway/i18n/mobile/pa/deals.json";
import paProfile from "@agent-runway/i18n/mobile/pa/profile.json";
import paAuth from "@agent-runway/i18n/mobile/pa/auth.json";

import yueCommon from "@agent-runway/i18n/mobile/yue/common.json";
import yueHome from "@agent-runway/i18n/mobile/yue/home.json";
import yueClients from "@agent-runway/i18n/mobile/yue/clients.json";
import yueDeals from "@agent-runway/i18n/mobile/yue/deals.json";
import yueProfile from "@agent-runway/i18n/mobile/yue/profile.json";
import yueAuth from "@agent-runway/i18n/mobile/yue/auth.json";

import esCommon from "@agent-runway/i18n/mobile/es/common.json";
import esHome from "@agent-runway/i18n/mobile/es/home.json";
import esClients from "@agent-runway/i18n/mobile/es/clients.json";
import esDeals from "@agent-runway/i18n/mobile/es/deals.json";
import esProfile from "@agent-runway/i18n/mobile/es/profile.json";
import esAuth from "@agent-runway/i18n/mobile/es/auth.json";

import tlCommon from "@agent-runway/i18n/mobile/tl/common.json";
import tlHome from "@agent-runway/i18n/mobile/tl/home.json";
import tlClients from "@agent-runway/i18n/mobile/tl/clients.json";
import tlDeals from "@agent-runway/i18n/mobile/tl/deals.json";
import tlProfile from "@agent-runway/i18n/mobile/tl/profile.json";
import tlAuth from "@agent-runway/i18n/mobile/tl/auth.json";

import arCommon from "@agent-runway/i18n/mobile/ar/common.json";
import arHome from "@agent-runway/i18n/mobile/ar/home.json";
import arClients from "@agent-runway/i18n/mobile/ar/clients.json";
import arDeals from "@agent-runway/i18n/mobile/ar/deals.json";
import arProfile from "@agent-runway/i18n/mobile/ar/profile.json";
import arAuth from "@agent-runway/i18n/mobile/ar/auth.json";

import hiCommon from "@agent-runway/i18n/mobile/hi/common.json";
import hiHome from "@agent-runway/i18n/mobile/hi/home.json";
import hiClients from "@agent-runway/i18n/mobile/hi/clients.json";
import hiDeals from "@agent-runway/i18n/mobile/hi/deals.json";
import hiProfile from "@agent-runway/i18n/mobile/hi/profile.json";
import hiAuth from "@agent-runway/i18n/mobile/hi/auth.json";

import urCommon from "@agent-runway/i18n/mobile/ur/common.json";
import urHome from "@agent-runway/i18n/mobile/ur/home.json";
import urClients from "@agent-runway/i18n/mobile/ur/clients.json";
import urDeals from "@agent-runway/i18n/mobile/ur/deals.json";
import urProfile from "@agent-runway/i18n/mobile/ur/profile.json";
import urAuth from "@agent-runway/i18n/mobile/ur/auth.json";

// ── Build Resources Object ───────────────────────────────────────────────────

const resources = {
  en:      { common: enCommon, home: enHome, clients: enClients, deals: enDeals, profile: enProfile, auth: enAuth },
  "fr-CA": { common: frCommon, home: frHome, clients: frClients, deals: frDeals, profile: frProfile, auth: frAuth },
  zh:      { common: zhCommon, home: zhHome, clients: zhClients, deals: zhDeals, profile: zhProfile, auth: zhAuth },
  pa:      { common: paCommon, home: paHome, clients: paClients, deals: paDeals, profile: paProfile, auth: paAuth },
  yue:     { common: yueCommon, home: yueHome, clients: yueClients, deals: yueDeals, profile: yueProfile, auth: yueAuth },
  es:      { common: esCommon, home: esHome, clients: esClients, deals: esDeals, profile: esProfile, auth: esAuth },
  tl:      { common: tlCommon, home: tlHome, clients: tlClients, deals: tlDeals, profile: tlProfile, auth: tlAuth },
  ar:      { common: arCommon, home: arHome, clients: arClients, deals: arDeals, profile: arProfile, auth: arAuth },
  hi:      { common: hiCommon, home: hiHome, clients: hiClients, deals: hiDeals, profile: hiProfile, auth: hiAuth },
  ur:      { common: urCommon, home: urHome, clients: urClients, deals: urDeals, profile: urProfile, auth: urAuth },
};

// ── Detect Saved or Device Language ──────────────────────────────────────────

const LANGUAGE_KEY = "user_language";

function getInitialLanguage(): SupportedLocale {
  try {
    const saved = storage.getString(LANGUAGE_KEY);
    if (saved && saved in resources) {
      return saved as SupportedLocale;
    }
  } catch {}

  // Detect from device locale
  const deviceLocales = Localization.getLocales();
  if (deviceLocales.length > 0) {
    const tag = deviceLocales[0].languageTag;
    return getClosestLocale(tag);
  }

  return "en";
}

/** Save the user's language preference to MMKV. */
export function saveLanguagePreference(locale: SupportedLocale): void {
  try {
    storage.set(LANGUAGE_KEY, locale);
  } catch {}
}

/** Get the currently saved language from MMKV (or null if none saved). */
export function getSavedLanguage(): SupportedLocale | null {
  try {
    const saved = storage.getString(LANGUAGE_KEY);
    if (saved && saved in resources) {
      return saved as SupportedLocale;
    }
  } catch {}
  return null;
}

// ── Initialize i18next ───────────────────────────────────────────────────────

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common", "home", "clients", "deals", "profile", "auth"],

  interpolation: {
    // React Native handles escaping; no HTML to worry about
    escapeValue: false,
  },

  // React-specific
  react: {
    useSuspense: false,
  },
});

export default i18n;
