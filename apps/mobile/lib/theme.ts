/**
 * Shared design tokens for the Agent Runway mobile app.
 * Matches the web app's visual language.
 */

export const C = {
  bg:           "#0A0A0F",
  card:         "#0F0F18",
  cardAlt:      "#13131E",
  cardBorder:   "#1F1F2E",
  cardHighBorder:"#2D2D44",
  primary:      "#6366F1",
  primaryDim:   "rgba(99,102,241,0.12)",
  primaryBorder:"rgba(99,102,241,0.30)",
  success:      "#10B981",
  successDim:   "rgba(16,185,129,0.12)",
  warning:      "#F59E0B",
  warningDim:   "rgba(245,158,11,0.12)",
  danger:       "#EF4444",
  dangerDim:    "rgba(239,68,68,0.12)",
  cyan:         "#06B6D4",
  cyanDim:      "rgba(6,182,212,0.12)",
  purple:       "#8B5CF6",
  purpleDim:    "rgba(139,92,246,0.12)",
  blue:         "#3B82F6",
  blueDim:      "rgba(59,130,246,0.12)",
  text:         "#FFFFFF",
  textMuted:    "#9CA3AF",
  textDim:      "#6B7280",
  textFaint:    "#374151",
  borderFaint:  "#1A1A28",
};

export const STAGE_COLORS: Record<string, string> = {
  lead:        "#6B7280",
  showing:     "#3B82F6",
  offer:       "#F59E0B",
  conditional: "#8B5CF6",
  firm:        "#10B981",
};

export const STATUS_COLORS: Record<string, string> = {
  boarding:  "#3B82F6",
  taxiing:   "#8B5CF6",
  approach:  "#F59E0B",
  in_flight: "#10B981",
  landed:    "#6B7280",
  cruising:  "#06B6D4",
};

export function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}
