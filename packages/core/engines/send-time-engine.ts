/**
 * Send Time Optimization Engine
 *
 * 3-tier system:
 * Tier 1 (default): RE industry best times
 * Tier 2 (with segment data): By client type
 * Tier 3 (per-contact): Individual history (future)
 */

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun-Sat
export type ClientSegment =
  | "buyer"
  | "seller"
  | "investor"
  | "past_client"
  | "lead"
  | "unknown";

interface SendWindow {
  day: DayOfWeek;
  hour: number; // 0-23 in local time
  score: number; // 0-100 relative effectiveness
}

/** Tier 1: Industry-wide optimal windows for real estate */
const INDUSTRY_WINDOWS: SendWindow[] = [
  // Tuesday-Thursday mornings are peak
  { day: 2, hour: 9, score: 95 },
  { day: 2, hour: 10, score: 90 },
  { day: 3, hour: 9, score: 92 },
  { day: 3, hour: 10, score: 88 },
  { day: 4, hour: 9, score: 90 },
  { day: 4, hour: 10, score: 85 },
  // Tuesday-Thursday afternoons are good
  { day: 2, hour: 14, score: 80 },
  { day: 2, hour: 15, score: 78 },
  { day: 3, hour: 14, score: 82 },
  { day: 3, hour: 15, score: 77 },
  { day: 4, hour: 14, score: 79 },
  { day: 4, hour: 15, score: 75 },
  // Monday/Friday are decent
  { day: 1, hour: 10, score: 70 },
  { day: 1, hour: 14, score: 65 },
  { day: 5, hour: 10, score: 68 },
  { day: 5, hour: 14, score: 62 },
];

/** Tier 2: Segment-specific adjustments */
const SEGMENT_ADJUSTMENTS: Record<
  ClientSegment,
  { preferredHours: number[]; dayBoost: DayOfWeek[] }
> = {
  buyer: { preferredHours: [18, 19, 20], dayBoost: [3, 4, 6] }, // Evenings + weekends for browsing
  seller: { preferredHours: [9, 10, 11], dayBoost: [2, 3] }, // Mornings for business decisions
  investor: { preferredHours: [8, 9, 14, 15], dayBoost: [1, 2, 3] }, // Business hours
  past_client: { preferredHours: [10, 11, 14], dayBoost: [2, 3, 4] }, // Mid-week, mid-day
  lead: { preferredHours: [9, 10, 18, 19], dayBoost: [2, 3, 4] }, // Mornings or evenings
  unknown: { preferredHours: [9, 10, 14, 15], dayBoost: [2, 3, 4] }, // Default industry
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Build the full set of scored windows by combining industry data with
 * segment-specific adjustments. Windows that match a segment's preferred
 * hours or boosted days get a score lift; additional windows are injected
 * for segment-preferred hours that don't appear in the industry set.
 */
function getScoreWindows(segment: ClientSegment): SendWindow[] {
  const adj = SEGMENT_ADJUSTMENTS[segment];
  const windows: SendWindow[] = [];

  // Start with industry windows, applying segment boosts
  for (const w of INDUSTRY_WINDOWS) {
    let score = w.score;
    if (adj.preferredHours.includes(w.hour)) {
      score = Math.min(100, score + 10);
    }
    if (adj.dayBoost.includes(w.day)) {
      score = Math.min(100, score + 5);
    }
    windows.push({ day: w.day, hour: w.hour, score });
  }

  // Inject segment-specific windows for preferred hours not already covered
  const existing = new Set(windows.map((w) => `${w.day}-${w.hour}`));

  for (const day of adj.dayBoost) {
    for (const hour of adj.preferredHours) {
      const key = `${day}-${hour}`;
      if (!existing.has(key)) {
        // Base score of 60 for segment-injected windows, boosted by both factors
        windows.push({ day, hour, score: 70 });
        existing.add(key);
      }
    }
  }

  // Also add preferred hours on non-boosted weekdays (Mon-Fri) at a lower score
  for (let day = 1 as DayOfWeek; day <= 5; day++) {
    for (const hour of adj.preferredHours) {
      const key = `${day}-${hour}`;
      if (!existing.has(key)) {
        windows.push({ day: day as DayOfWeek, hour, score: 55 });
        existing.add(key);
      }
    }
  }

  return windows;
}

/**
 * Get the optimal send time for an outreach message.
 * Returns a Date object for the next optimal send window.
 */
export function getOptimalSendTime(opts: {
  segment?: ClientSegment;
  timezone?: string; // IANA timezone, defaults to "America/Toronto"
  afterDate?: Date; // Don't schedule before this date
}): Date {
  const {
    segment = "unknown",
    timezone: _timezone = "America/Toronto",
    afterDate = new Date(),
  } = opts;

  // Get windows sorted by score descending
  const windows = getScoreWindows(segment).sort((a, b) => b.score - a.score);

  const now = afterDate;

  // Search up to 14 days out for the best available window
  // Strategy: iterate by score priority, then find the earliest date for each window
  let bestCandidate: Date | null = null;
  let bestScore = -1;

  for (const window of windows) {
    // Find the next occurrence of this day/hour after now
    const candidate = new Date(now);
    candidate.setHours(window.hour, 0, 0, 0);

    // Advance to the correct day of week
    const currentDay = candidate.getDay() as DayOfWeek;
    let daysUntil = (window.day - currentDay + 7) % 7;

    // If it's the same day but the hour has already passed, go to next week
    if (daysUntil === 0 && candidate <= now) {
      daysUntil = 7;
    }

    candidate.setDate(candidate.getDate() + daysUntil);

    // Only consider windows within the next 14 days
    const daysDiff =
      (candidate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 14) continue;

    // Pick the highest-scoring window; break ties by earliest date
    if (
      window.score > bestScore ||
      (window.score === bestScore &&
        bestCandidate &&
        candidate < bestCandidate)
    ) {
      bestScore = window.score;
      bestCandidate = candidate;
    }

    // Once we've evaluated all windows with the top score, stop
    if (bestCandidate && window.score < bestScore) {
      break;
    }
  }

  if (bestCandidate) {
    return bestCandidate;
  }

  // Fallback: next Tuesday at 10am
  const fallback = new Date(now);
  fallback.setHours(10, 0, 0, 0);
  while (fallback.getDay() !== 2 || fallback <= now) {
    fallback.setDate(fallback.getDate() + 1);
  }
  fallback.setHours(10, 0, 0, 0);
  return fallback;
}

/**
 * Score a specific send time (0-100).
 * Used to evaluate user-chosen send times.
 */
export function scoreSendTime(date: Date, segment?: ClientSegment): number {
  const seg = segment ?? "unknown";
  const day = date.getDay() as DayOfWeek;
  const hour = date.getHours();

  const windows = getScoreWindows(seg);

  // Exact match
  const exact = windows.find((w) => w.day === day && w.hour === hour);
  if (exact) return exact.score;

  // Near-miss: same day, within 1 hour of a window
  const nearHour = windows.filter(
    (w) => w.day === day && Math.abs(w.hour - hour) === 1
  );
  if (nearHour.length > 0) {
    const best = Math.max(...nearHour.map((w) => w.score));
    return Math.max(0, best - 15);
  }

  // Same day, within 2 hours
  const nearish = windows.filter(
    (w) => w.day === day && Math.abs(w.hour - hour) <= 2
  );
  if (nearish.length > 0) {
    const best = Math.max(...nearish.map((w) => w.score));
    return Math.max(0, best - 25);
  }

  // Weekend penalty
  if (day === 0 || day === 6) {
    // Buyers get a small pass on weekends
    if (seg === "buyer" && hour >= 10 && hour <= 20) return 40;
    return 20;
  }

  // Weekday but far from any window
  if (hour >= 8 && hour <= 17) return 35; // Business hours baseline
  if (hour >= 6 && hour <= 21) return 25; // Waking hours
  return 10; // Unsociable hours
}

/**
 * Get a human-readable recommendation.
 */
export function getSendTimeRecommendation(segment: ClientSegment): string {
  const adj = SEGMENT_ADJUSTMENTS[segment];

  const dayNames = adj.dayBoost.map((d) => DAY_NAMES[d]);
  const dayStr =
    dayNames.length > 2
      ? `${dayNames.slice(0, -1).join(", ")}, and ${dayNames[dayNames.length - 1]}`
      : dayNames.join(" and ");

  const hours = [...adj.preferredHours].sort((a, b) => a - b);
  const hourStr = formatHourRange(hours);

  const labels: Record<ClientSegment, string> = {
    buyer: "buyers",
    seller: "sellers",
    investor: "investors",
    past_client: "past clients",
    lead: "new leads",
    unknown: "contacts",
  };

  return `Best times for ${labels[segment]}: ${dayStr} ${hourStr}`;
}

/** Format a sorted array of hours into a readable range string */
function formatHourRange(hours: number[]): string {
  if (hours.length === 0) return "";

  const ranges: string[] = [];
  let start = hours[0];
  let end = hours[0];

  for (let i = 1; i < hours.length; i++) {
    if (hours[i] === end + 1) {
      end = hours[i];
    } else {
      ranges.push(
        start === end
          ? formatHour(start)
          : `${formatHour(start)}-${formatHour(end + 1)}`
      );
      start = hours[i];
      end = hours[i];
    }
  }
  ranges.push(
    start === end
      ? formatHour(start)
      : `${formatHour(start)}-${formatHour(end + 1)}`
  );

  return ranges.join(" or ");
}

function formatHour(h: number): string {
  if (h === 0 || h === 24) return "12am";
  if (h === 12) return "12pm";
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}
