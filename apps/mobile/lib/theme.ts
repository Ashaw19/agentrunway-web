/**
 * Agent Runway — Mobile Design System
 * Matched to the web app's OKLCH-based color system.
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
// Colors aligned with web app's CSS variables (oklch converted to hex)

function palette(mode: ThemeMode) {
  const dark = mode === "dark";
  return {
    // Backgrounds — web: oklch(0.129, 0.042, 264.695) dark, oklch(1,0,0) light
    bg:             dark ? "#131326" : "#FFFFFF",
    bgElevated:     dark ? "#171733" : "#FAFAFE",
    card:           dark ? "#1E1E3A" : "#FFFFFF",
    cardBorder:     dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
    cardHighBorder: dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)",

    // Brand — web: Runway Blue oklch(0.57, 0.240, 261) ≈ #3B5EF6
    primary:        "#3B5EF6",
    primaryLight:   "#6380F8",
    primaryDim:     dark ? "rgba(59,94,246,0.12)" : "rgba(59,94,246,0.08)",
    primaryBorder:  dark ? "rgba(59,94,246,0.25)" : "rgba(59,94,246,0.20)",

    // Commission Gold — web: oklch(0.75, 0.19, 73) ≈ #F0A800
    gold:           "#F0A800",
    goldLight:      "#F5BE3A",
    goldDim:        dark ? "rgba(240,168,0,0.14)" : "rgba(240,168,0,0.08)",

    // Semantic — chart colors from web
    success:        "#10B981",  // Chart-1 emerald
    successLight:   "#34D399",
    successDim:     dark ? "rgba(16,185,129,0.12)" : "rgba(16,185,129,0.08)",
    warning:        "#F59E0B",  // Warning amber
    warningLight:   "#FBBF24",
    warningDim:     dark ? "rgba(245,158,11,0.12)" : "rgba(245,158,11,0.08)",
    danger:         "#EF4444",  // Critical red
    dangerDim:      dark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.08)",
    cyan:           "#06B6D4",  // Chart-4 teal
    cyanDim:        dark ? "rgba(6,182,212,0.12)" : "rgba(6,182,212,0.08)",
    purple:         "#8B5CF6",  // Chart-2 violet
    purpleDim:      dark ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.08)",
    blue:           "#3B82F6",  // Info blue
    blueDim:        dark ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.08)",

    // Text — web: oklch(0.984) light-on-dark, oklch(0.129) dark-on-light
    text:           dark ? "#F5F5FA" : "#111827",
    textSecondary:  dark ? "#D1D5E0" : "#374151",
    textMuted:      dark ? "#9CA3B8" : "#6B7280",
    textDim:        dark ? "#6B728A" : "#9CA3AF",
    textFaint:      dark ? "#3A3F55" : "#D1D5DB",

    // Elevated surfaces — 3-layer depth system (research: premium apps use layered darkness)
    cardElevated:   dark ? "#242450" : "#FFFFFF",
    cardElevatedBorder: dark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.08)",
    surfaceGlass:   dark ? "rgba(30,30,70,0.75)" : "rgba(255,255,255,0.85)",

    // Misc
    overlay:        dark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)",
    divider:        dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",

    // Tab bar — matches web sidebar dark navy
    tabBg:          dark ? "#111126" : "#FFFFFF",
    tabBorder:      dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",

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
// Matched to web's gradient tokens

export function gradients(mode: ThemeMode) {
  const dark = mode === "dark";
  return {
    // Web: --gradient-runway (navy → blue)
    heroCard:    dark ? ["#161640", "#111126"] : ["#EEF0FF", "#FFFFFF"],
    // Web: --gradient-growth (emerald → teal)
    growthCard:  dark ? ["#0A2A1A", "#0E1420"] : ["#ECFDF5", "#FFFFFF"],
    tabBar:      dark ? ["#111126", "#0E0E1A"] : ["#FFFFFF", "#F8F9FB"],
    // Web: --gradient-ascent (blue → violet)
    mic:         ["#3B5EF6", "#5B4FE5"],
    micActive:   ["#EF4444", "#DC2626"],
    // Web: Runway Blue → Runway Blue lighter
    progressBar: ["#3B5EF6", "#6380F8"],
    successBar:  ["#10B981", "#34D399"],
    // Web: --gradient-commission (gold → dark gold)
    goldBar:     ["#F0A800", "#D97706"],
    // Web: --gradient-horizon (gold → blue → violet)
    horizon:     ["#F0A800", "#3B5EF6", "#8B5CF6"],
  };
}

// ── Elevation Shadows ─────────────────────────────────────────────────────────
// Web uses 3-layer shadow system with oklch shadow color

export function shadows(mode: ThemeMode) {
  const dark = mode === "dark";
  return {
    // Web: --shadow-sm (contact + light lift)
    card: Platform.select({
      ios: {
        shadowColor: dark ? "#000" : "#4B5563",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: dark ? 0.25 : 0.06,
        shadowRadius: 6,
      },
      android: { elevation: dark ? 3 : 2 },
      default: {},
    }) as object,

    // Web: --shadow (full 3-layer)
    cardLg: Platform.select({
      ios: {
        shadowColor: dark ? "#000" : "#4B5563",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: dark ? 0.35 : 0.10,
        shadowRadius: 16,
      },
      android: { elevation: dark ? 6 : 4 },
      default: {},
    }) as object,

    // Glow effect — web: .glow-gold, .glow-blue
    glow: (color: string) =>
      Platform.select({
        ios: {
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.4,
          shadowRadius: 16,
        },
        android: { elevation: 6 },
        default: {},
      }) as object,

    // Gold glow — web: pulse-gold animation
    goldGlow: Platform.select({
      ios: {
        shadowColor: "#F0A800",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
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
// Web: --radius = 0.75rem (12px), cards use rounded-2xl (20px)

export const Radius = {
  sm: 8,   // Web: --radius-sm (radius - 4px)
  md: 10,  // Web: --radius-md (radius - 2px)
  lg: 12,  // Web: --radius-lg (radius)
  xl: 20,  // Web: rounded-2xl (cards)
  xxl: 24, // Web: --radius-3xl
  pill: 100,
} as const;

// ── Typography ────────────────────────────────────────────────────────────────
// Web uses Geist (system font family on mobile); sizes mapped from Tailwind

export const Type = {
  hero:     { fontSize: 34, fontWeight: "900" as const, letterSpacing: -1.0, lineHeight: 38 },
  h1:       { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.8, lineHeight: 32 },
  h2:       { fontSize: 22, fontWeight: "800" as const, letterSpacing: -0.5, lineHeight: 28 },
  h3:       { fontSize: 17, fontWeight: "700" as const, letterSpacing: -0.2, lineHeight: 22 },
  body:     { fontSize: 15, fontWeight: "400" as const, letterSpacing: 0, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: "600" as const, letterSpacing: -0.1, lineHeight: 22 },
  caption:  { fontSize: 13, fontWeight: "500" as const, letterSpacing: 0.1, lineHeight: 18 },
  micro:    { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.3, lineHeight: 14 },
  label:    { fontSize: 10, fontWeight: "700" as const, letterSpacing: 1.2, textTransform: "uppercase" as const, lineHeight: 14 },
  bigNum:   { fontSize: 32, fontWeight: "900" as const, letterSpacing: -0.8, lineHeight: 36 },
};

// ── Animation Tokens ─────────────────────────────────────────────────────────
// Web: cubic-bezier(0.22, 1, 0.36, 1) — fast, bouncy

export const Motion = {
  springDefault: { damping: 0.8, stiffness: 250 },
  springSnappy:  { damping: 0.7, stiffness: 350 },
  durationFast:   150,
  durationNormal: 220,  // Web: 0.22s
  durationSlow:   400,
  pressScale:     0.97,
} as const;

// ── Pipeline Stage Colors ─────────────────────────────────────────────────────
// Matched to web's badge variants

export const STAGE_COLORS: Record<string, string> = {
  lead: "#6B7280", showing: "#3B82F6", offer: "#F59E0B",
  conditional: "#8B5CF6", firm: "#10B981", closed: "#16A34A",
};

// ── Client Flight Status Colors ───────────────────────────────────────────────

// boarding=sky, scheduled=slate, in_flight=violet, cruising=blue
export const STATUS_COLORS: Record<string, string> = {
  boarding: "#0EA5E9",
  scheduled: "#64748B",
  in_flight: "#8B5CF6",
  cruising: "#3B82F6",
};


// ── Utilities ─────────────────────────────────────────────────────────────────

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

const _cadFmt = new Intl.NumberFormat("en-CA", {
  style: "currency", currency: "CAD",
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});
export function fmtCurrency(n: number): string {
  return _cadFmt.format(n);
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
