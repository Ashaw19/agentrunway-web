/**
 * Pure layout geometry for the Flight Plan "runway" instrument. No DOM, no
 * React — deterministic and unit-tested. Consumed by the FlightPath primitive
 * in components/cockpit-ui.tsx.
 *
 * A runway is an origin gate (day 0, the trigger) followed by one node per
 * automation step, each landing on its delay_days. The connector leading INTO
 * each node gets a flex-grow weight proportional to the WAIT before it, so a
 * "Day 0 → Day 1 → Day 30" path reads as a short hop then a long taxi — the
 * timing stays legible without absolute pixel positioning (which would collide
 * same-day steps and break inside a narrow card).
 *
 * The scale is sqrt(gap) with a floor, mirroring magnitudePct's reasoning: one
 * long wait shouldn't flatten every short one to nothing, and a zero-day gap
 * (two touches the same day) still earns a visible minimum segment.
 */

/** Minimum connector weight, so a same-day (gap 0) step still separates. */
export const FLIGHT_PATH_MIN_GROW = 1;

/**
 * Flex-grow weights for the connectors of a runway.
 *
 * @param days ascending node days INCLUDING the origin gate as the first
 *   element (typically `[0, ...stepDelays]`).
 * @returns one weight per connector — i.e. `days.length - 1` values. Empty when
 *   there is nothing to connect (0 or 1 nodes).
 */
export function flightPathSegments(days: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const gap = Math.max(0, days[i] - days[i - 1]);
    out.push(FLIGHT_PATH_MIN_GROW + Math.sqrt(gap));
  }
  return out;
}
