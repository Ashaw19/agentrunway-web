import { describe, it, expect } from "vitest";
import { flightPathSegments, FLIGHT_PATH_MIN_GROW } from "../flight-path-geometry";

describe("flightPathSegments", () => {
  it("returns no connectors for an empty or single-node path", () => {
    expect(flightPathSegments([])).toEqual([]);
    expect(flightPathSegments([0])).toEqual([]);
  });

  it("emits one weight per connector (days.length - 1)", () => {
    expect(flightPathSegments([0, 3, 7])).toHaveLength(2);
    expect(flightPathSegments([0, 1, 2, 3, 4])).toHaveLength(4);
  });

  it("floors a same-day gap to the minimum so the step still separates", () => {
    // origin day 0, two steps both on day 0 → both gaps are 0
    expect(flightPathSegments([0, 0, 0])).toEqual([
      FLIGHT_PATH_MIN_GROW,
      FLIGHT_PATH_MIN_GROW,
    ]);
  });

  it("weights a longer wait more than a shorter one, but sqrt-compressed", () => {
    const [hop, taxi] = flightPathSegments([0, 1, 30]);
    expect(hop).toBeCloseTo(FLIGHT_PATH_MIN_GROW + 1, 5); // gap 1 → 1+√1 = 2
    expect(taxi).toBeCloseTo(FLIGHT_PATH_MIN_GROW + Math.sqrt(29), 5);
    expect(taxi).toBeGreaterThan(hop);
    // sqrt compression: a 29× longer wait is far less than 29× wider
    expect(taxi / hop).toBeLessThan(29);
  });

  it("clamps a non-monotonic (negative) gap to the minimum", () => {
    // day goes backwards 5 → 2; gap clamps to 0
    expect(flightPathSegments([0, 5, 2])[1]).toBe(FLIGHT_PATH_MIN_GROW);
  });
});
