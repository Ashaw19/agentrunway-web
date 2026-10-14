/**
 * Repeat client rate reference points: one table, read by the Clients page
 * KPI strip, the Insights card, the Scan cards' impact line and Flight Crew.
 *
 * Until 2026-10-13 the rate was judged on cut-offs typed into each file: the
 * Insights card at 15, 20 and 30, the KPI strip at 35, Scan cards at 25. The
 * two kept are 15% and 30%, the pair the Insights card put into words.
 */
import { describe, expect, it } from "vitest";
import {
  REPEAT_RATE_BANDS,
  REPEAT_RATE_COPY,
  REPEAT_RATE_GAUGE_LOWER_MARK_PCT,
  REPEAT_RATE_GAUGE_MAX_PCT,
  REPEAT_RATE_LOWER_REFERENCE_PCT,
  REPEAT_RATE_MIN_CLIENTS,
  REPEAT_RATE_UPPER_REFERENCE_PCT,
  isRepeatRateAtOrAboveUpper,
  repeatRateBand,
  repeatRateBandRange,
  repeatRateBandsList,
  repeatRateGaugePct,
  repeatRateVsReferencePoints,
} from "../repeat-rate-bands";

/** Enough clients for a rate to be placed. */
const CLIENTS = 20;

describe("REPEAT_RATE_BANDS", () => {
  it("has two reference points, 15% and 30%, and a band either side of each", () => {
    expect(REPEAT_RATE_LOWER_REFERENCE_PCT).toBe(15);
    expect(REPEAT_RATE_UPPER_REFERENCE_PCT).toBe(30);
    expect(REPEAT_RATE_BANDS.map((b) => [b.key, b.min])).toEqual([
      ["belowLower", 0],
      ["between", 15],
      ["atOrAboveUpper", 30],
    ]);
  });

  it("is ordered from the lowest rate up, starting at zero", () => {
    const mins = REPEAT_RATE_BANDS.map((b) => b.min);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    expect(mins[0]).toBe(0);
  });

  it("labels each band by where the rate sits, with no judgement on it", () => {
    expect(REPEAT_RATE_BANDS.map((b) => b.label)).toEqual([
      "Below the lower reference point",
      "Between the reference points",
      "At or above the upper reference point",
    ]);
    const judgement = /excellent|good|great|strong|weak|poor|healthy|\blow\b|\bhigh\b|opportunity/i;
    for (const band of REPEAT_RATE_BANDS) expect(band.label).not.toMatch(judgement);
  });

  it("gives no band a health colour", () => {
    // Emerald, blue, amber and red mean healthy, acceptable, watch and concern
    // on the dashboard (spec §9.1). A reference point passes no such verdict.
    expect(REPEAT_RATE_BANDS.map((b) => b.tone)).toEqual(["slate", "lightViolet", "violet"]);
  });

  it("states each band's range from its own edges", () => {
    expect(REPEAT_RATE_BANDS.map(repeatRateBandRange)).toEqual(["under 15%", "15% to under 30%", "30% or more"]);
  });
});

describe("repeatRateBand", () => {
  it("places a rate by inclusive lower edge", () => {
    const key = (rate: number) => repeatRateBand(rate, CLIENTS)?.key;
    expect(key(0)).toBe("belowLower");
    expect(key(14)).toBe("belowLower");
    expect(key(15)).toBe("between");
    expect(key(29)).toBe("between");
    expect(key(30)).toBe("atOrAboveUpper");
    expect(key(100)).toBe("atOrAboveUpper");
  });

  it("places the rates the old cut-offs disagreed on in one band each", () => {
    // 20% highlighted the card but read as the middle sentence. 27% was
    // "strong" on a Scan card and "Good" on the Insights card. 32% was
    // "Excellent" with the KPI strip's bar still short of full.
    expect(repeatRateBand(20, CLIENTS)?.key).toBe("between");
    expect(repeatRateBand(27, CLIENTS)?.key).toBe("between");
    expect(isRepeatRateAtOrAboveUpper(27, CLIENTS)).toBe(false);
    expect(repeatRateBand(32, CLIENTS)?.key).toBe("atOrAboveUpper");
    expect(repeatRateGaugePct(32, CLIENTS)).toBe(100);
  });

  it("has no band for a rate over fewer than two clients", () => {
    expect(REPEAT_RATE_MIN_CLIENTS).toBe(2);
    // One client with two deals is a 100% rate that says nothing.
    expect(repeatRateBand(100, 1)).toBeNull();
    expect(repeatRateBand(0, 0)).toBeNull();
    expect(repeatRateBand(50, 2)?.key).toBe("atOrAboveUpper");
    expect(isRepeatRateAtOrAboveUpper(100, 1)).toBe(false);
    expect(repeatRateGaugePct(100, 1)).toBe(0);
    expect(repeatRateVsReferencePoints(100, 1)).toBeNull();
  });

  it("has no band for a rate that is not a number", () => {
    expect(repeatRateBand(Number.NaN, CLIENTS)).toBeNull();
    expect(repeatRateBand(Number.POSITIVE_INFINITY, CLIENTS)).toBeNull();
    expect(repeatRateBand(-5, CLIENTS)).toBeNull();
    expect(repeatRateBand(20, Number.NaN)).toBeNull();
  });
});

describe("repeatRateGaugePct", () => {
  it("is full at the upper reference point and half full at the lower one", () => {
    expect(REPEAT_RATE_GAUGE_MAX_PCT).toBe(REPEAT_RATE_UPPER_REFERENCE_PCT);
    expect(repeatRateGaugePct(0, CLIENTS)).toBe(0);
    expect(repeatRateGaugePct(REPEAT_RATE_LOWER_REFERENCE_PCT, CLIENTS)).toBe(REPEAT_RATE_GAUGE_LOWER_MARK_PCT);
    expect(REPEAT_RATE_GAUGE_LOWER_MARK_PCT).toBe(50);
    expect(repeatRateGaugePct(REPEAT_RATE_UPPER_REFERENCE_PCT, CLIENTS)).toBe(100);
  });

  it("never runs past the end of the bar", () => {
    expect(repeatRateGaugePct(75, CLIENTS)).toBe(100);
    expect(repeatRateGaugePct(100, CLIENTS)).toBe(100);
  });

  it("fills in step with the band: under full below the upper reference point, full from it", () => {
    for (let rate = 0; rate <= 100; rate++) {
      const full = repeatRateGaugePct(rate, CLIENTS) === 100;
      expect(full, `${rate}%`).toBe(isRepeatRateAtOrAboveUpper(rate, CLIENTS));
    }
  });
});

describe("wording", () => {
  it("is built from the reference points", () => {
    expect(REPEAT_RATE_COPY.referencePoints).toBe("15% and 30%");
    expect(REPEAT_RATE_COPY.lowerMarkCaption).toBe("15%");
    expect(REPEAT_RATE_COPY.gaugeMaxCaption).toBe("30%+");
    expect(REPEAT_RATE_COPY.referenceSentence).toBe(
      "Agent Runway marks two reference points on the repeat client rate: 15% and 30%.",
    );
    expect(REPEAT_RATE_COPY.minClientsSentence).toBe("A rate is placed against them once 2 or more clients have a deal.");
    expect(REPEAT_RATE_COPY.bandsSentence).toBe(
      "Under 15% is below the lower reference point, 15% to under 30% is between the reference points and 30% or more is at or above the upper reference point.",
    );
  });

  it("says whose reference points they are", () => {
    expect(REPEAT_RATE_COPY.provenance).toBe("The reference points are Agent Runway's own, not an industry statistic.");
  });

  it("says where a rate sits against them", () => {
    expect(repeatRateVsReferencePoints(8, CLIENTS)).toBe("below Agent Runway's lower reference point of 15%");
    expect(repeatRateVsReferencePoints(22, CLIENTS)).toBe("between Agent Runway's reference points of 15% and 30%");
    expect(repeatRateVsReferencePoints(41, CLIENTS)).toBe("at or above Agent Runway's upper reference point of 30%");
  });

  it("lists the bands one per line for Flight Crew", () => {
    expect(repeatRateBandsList()).toBe(
      [
        "- under 15%: Below the lower reference point",
        "- 15% to under 30%: Between the reference points",
        "- 30% or more: At or above the upper reference point",
      ].join("\n"),
    );
  });

  it("passes no judgement and makes no industry claim", () => {
    const everything = [
      ...Object.values(REPEAT_RATE_COPY),
      repeatRateBandsList(),
      ...[8, 22, 41].map((rate) => repeatRateVsReferencePoints(rate, CLIENTS) ?? ""),
    ].join(" ");
    expect(everything).not.toMatch(/excellent|good|great|strong|weak|poor|healthy|opportunity/i);
    expect(everything).not.toMatch(/industry (?:average|benchmark|standard)|top producers|typical/i);
    expect(everything).not.toContain("—");
  });
});
