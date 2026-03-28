/**
 * Agent Runway — Mobile Design System
 * Light & Dark mode support. Premium, clean, modern.
 */

import { Platform } from "react-native";
import { create } from "zustand";
import { storage } from "./mmkv";

// ── Theme Mode Store ──────────────────────────────────────────────────────────

type ThemeMode = "light" | "dark";

interface ThemeStore {
  mode: ThemeMode;
  toggle: () => void;
  set: (mode: ThemeMode) => void;
}

const THEME_KEY = "theme_mode";

function getSavedTheme(): ThemeMode {
  try {
    return (storage.getString(THEME_KEY) as ThemeMode) ?? "dark";
  } catch {
    return "dark"; // SSR / static rendering fallback
  }
}

export const useTheme = create<ThemeStore>((set) => ({
  mode: getSavedTheme(),
  toggle: () =>
    set((s) => {
      const next = s.mode === "dark" ? "light" : "dark";
      try { storage.set(THEME_KEY, next); } catch {}
      return { mode: next };
    }),
  set: (mode) => {
    try { storage.set(THEME_KEY, mode); } catch {}
    set({ mode });
  },
}));

// ── Palette Factory ───────────────────────────────────────────────────────────

function palette(mode: ThemeMode) {
  const dark = mode === "dark";
  return {
    // Backgrounds
    bg:             dark ? "#0A0A0F" : "#F8F9FB",
    bgElevated:     dark ? "#0E0E17" : "#FFFFFF",
    card:           dark ? "#14142A" : "#FFFFFF",
    cardBorder:     dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    cardHighBorder: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",

    // Brand
    primary:        "#6366F1",
    primaryLight:   "#818CF8",
    primaryDim:     dark ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.08)",
    primaryBorder:  dark ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.20)",

    // Commission Gold
    gold:           "#C8A24E",
    goldLight:      "#DABB6A",
    goldDim:        dark ? "rgba(200,162,78,0.12)" : "rgba(200,162,78,0.08)",

    // Semantic
    success:        "#10B981",
    successLight:   "#34D399",
    successDim:     dark ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.08)",
    warning:        "#F59E0B",
    warningLight:   "#FBBF24",
    warningDim:     dark ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.08)",
    danger:         "#EF4444",
    dangerDim:      dark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.08)",
    cyan:           "#06B6D4",
    cyanDim:        dark ? "rgba(6,182,212,0.12)" : "rgba(6,182,212,0.08)",
    purple:         "#8B5CF6",
    purpleDim:      dark ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.08)",
    blue:           "#3B82F6",
    blueDim:        dark ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.08)",

    // Text
    text:           dark ? "#FFFFFF" : "#111827",
    textSecondary:  dark ? "#D1D5DB" : "#374151",
    textMuted:      dark ? "#9CA3AF" : "#6B7280",
    textDim:        dark ? "#6B7280" : "#9CA3AF",
    textFaint:      dark ? "#374151" : "#D1D5DB",

    // Misc
    overlay:        dark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)",
    divider:        dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",

    // Tab bar
    tabBg:          dark ? "#0D0D1A" : "#FFFFFF",
    tabBorder:      dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)",

    // Status bar
    statusBarStyle: dark ? ("light" as const) : ("dark" as const),
  };
}

/** Get colors for current or specified mode */
export function colors(mode?: ThemeMode) {
  return palette(mode ?? "dark");
}

/** Convenience — returns current theme colors inside a component */
export function useColors() {
  const { mode } = useTheme();
  return palette(mode);
}

// ── Gradients ─────────────────────────────────────────────────────────────────

export function gradients(mode: ThemeMode) {
  const dark = mode === "dark";
  return {
    heroCard:    dark ? ["#1A1040", "#0E0E1A"] as const : ["#F0EEFF", "#FFFFFF"] as const,
    growthCard:  dark ? ["#0A2A1A", "#0A0F14"] as const : ["#ECFDF5", "#FFFFFF"] as const,
    tabBar:      dark ? ["#0D0D1A", "#0A0A12"] as const : ["#FFFFFF", "#F8F9FB"] as const,
    mic:         ["#6366F1", "#4F46E5"] as const,
    micActive:   ["#EF4444", "#DC2626"] as const,
    progressBar: ["#6366F1", "#818CF8"] as const,
    successBar:  ["#10B981", "#34D399"] as const,
  };
}

// ── Elevation Shadows ─────────────────────────────────────────────────────────

export function shadows(mode: ThemeMode) {
  const dark = mode === "dark";
  return {
    card: Platform.select({
      ios: {
        shadowColor: dark ? "#000" : "#6B7280",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: dark ? 0.3 : 0.08,
        shadowRadius: 8,
      },
      android: { elevation: dark ? 4 : 2 },
      default: {},
    }) as object,

    cardLg: Platform.select({
      ios: {
        shadowColor: dark ? "#000" : "#6B7280",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: dark ? 0.4 : 0.12,
        shadowRadius: 16,
      },
      android: { elevation: dark ? 8 : 4 },
      default: {},
    }) as object,

    glow: (color: string) =>
      Platform.select({
        ios: {
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
        },
        android: { elevation: 6 },
        default: {},
      }) as object,
  };
}

// ── Spacing ───────────────────────────────────────────────────────────────────

export const Space = {
  xs: 4,  sm: 8,  md: 12,  lg: 16,  xl: 20,  xxl: 24,  xxxl: 32,
  section: 48,
  hero: 64,
} as const;

// ── Radii ─────────────────────────────────────────────────────────────────────

export const Radius = {
  sm: 8,  md: 12,  lg: 16,  xl: 20,  xxl: 24,  pill: 100,
} as const;

// ── Typography ────────────────────────────────────────────────────────────────

export const Type = {
  hero:     { fontSize: 32, fontWeight: "800" as const, letterSpacing: -0.8, lineHeight: 34 },
  h1:       { fontSize: 26, fontWeight: "800" as const, letterSpacing: -0.6, lineHeight: 28 },
  h2:       { fontSize: 20, fontWeight: "700" as const, letterSpacing: -0.4, lineHeight: 24 },
  h3:       { fontSize: 17, fontWeight: "700" as const, letterSpacing: -0.2, lineHeight: 22 },
  body:     { fontSize: 15, fontWeight: "400" as const, letterSpacing: 0, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: "600" as const, letterSpacing: 0, lineHeight: 22 },
  caption:  { fontSize: 13, fontWeight: "500" as const, letterSpacing: 0.1, lineHeight: 18 },
  micro:    { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.3, lineHeight: 14 },
  label:    { fontSize: 10, fontWeight: "700" as const, letterSpacing: 1.0, textTransform: "uppercase" as const, lineHeight: 14 },
  bigNum:   { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.5, lineHeight: 34 },
};

// ── Animation Tokens ─────────────────────────────────────────────────────────

export const Motion = {
  springDefault: { damping: 0.8, stiffness: 250 },
  springSnappy:  { damping: 0.7, stiffness: 350 },
  durationFast:   150,
  durationNormal: 250,
  durationSlow:   400,
  pressScale:     0.97,
} as const;

// ── Pipeline Stage Colors ─────────────────────────────────────────────────────

export const STAGE_COLORS: Record<string, string> = {
  lead: "#6B7280", showing: "#3B82F6", offer: "#F59E0B",
  conditional: "#8B5CF6", firm: "#10B981",
};

// ── Client Flight Status Colors ───────────────────────────────────────────────

export const STATUS_COLORS: Record<string, string> = {
  boarding: "#3B82F6", taxiing: "#8B5CF6", approach: "#F59E0B",
  in_flight: "#10B981", landed: "#6B7280", cruising: "#06B6D4",
};

/** Canonical flight-status color mapping (preferred over STATUS_COLORS) */
export const StatusColors: Record<string, string> = {
  cruising:   "#10B981",   // green
  turbulence: "#F59E0B",   // amber
  grounded:   "#EF4444",   // red
  boarding:   "#6366F1",   // indigo
  landed:     "#8B5CF6",   // purple
  departed:   "#06B6D4",   // cyan
};

// ── Utilities ─────────────────────────────────────────────────────────────────

export function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

// ── Legacy compat (for screens not yet migrated) ──────────────────────────────

export const C = colors("dark");
