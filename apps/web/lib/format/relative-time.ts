/** Plain-language relative time ("just now", "3m ago"). Pure, unit-tested. */
export function relativeTime(sinceMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - sinceMs) / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
