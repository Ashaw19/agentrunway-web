/**
 * How tall a bottom sheet (components/ui/Sheet.tsx) may grow, in points.
 *
 * The sheet used to take `maxHeight: "85%"`, a percentage of a wrapper with
 * no height of its own, so it resolved against the wrong size and capped
 * short sheets at about 326pt on an iPhone 17: the "+" sheet's last row and
 * the Runway Score sheet's bottom were cut off (simulator, 2026-10-20).
 * The cap is worked out from the window's height instead.
 *
 * Pure: no React Native.
 */
export const SHEET_MAX_SHARE = 0.85;

export function sheetMaxHeight(windowHeight: number, maxHeight?: number | `${number}%`): number {
  if (typeof maxHeight === "number") return maxHeight;
  const share = maxHeight ? Number.parseFloat(maxHeight) / 100 : SHEET_MAX_SHARE;
  return Math.round(windowHeight * (Number.isFinite(share) && share > 0 ? share : SHEET_MAX_SHARE));
}
