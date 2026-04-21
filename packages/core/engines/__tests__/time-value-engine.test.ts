import { describe, it, expect } from "vitest";
import { computeTimeValue, type TimeValueInput } from "../time-value-engine";

function makeInput(overrides: Partial<TimeValueInput> = {}): TimeValueInput {
  return {
    estimatedWeeklyHours: 45,
    vacationWeeks: 0,
    ytdGCI: 75_000,
    ytdNetIncome: 45_000,
    projectedAnnualNet: 120_000,
    projectedAnnualGCI: 250_000,
    dealCount: 6,
    annualExpenses: 30_000,
    yearFractionElapsed: 0.25,
    ...overrides,
  };
}

describe("time-value-engine", () => {
  it("computes effective hourly rate from projected net / annual hours", () => {
    const result = computeTimeValue(makeInput());
    // 120,000 / (45 * 52) = 120,000 / 2,340 ≈ $51.28
    expect(result.effectiveHourlyRate).toBeCloseTo(51.28, 1);
    expect(result.annualHours).toBe(2340);
    expect(result.workingWeeks).toBe(52);
  });

  it("computes gross hourly rate from projected GCI / annual hours", () => {
    const result = computeTimeValue(makeInput());
    // 250,000 / 2,340 ≈ $106.84
    expect(result.grossHourlyRate).toBeCloseTo(106.84, 1);
  });

  it("computes annualized per-deal metrics", () => {
    const result = computeTimeValue(makeInput());
    // 6 deals in 0.25 of year → annualized 24 deals
    // Revenue per deal: 250,000 / 24 ≈ 10,417
    expect(result.revenuePerDeal).toBeCloseTo(10_417, -1);
    // Hours per deal: 2,340 / 24 = 97.5
    expect(result.hoursPerDeal).toBeCloseTo(97.5, 0);
    // Net per deal: 120,000 / 24 = 5,000
    expect(result.netPerDeal).toBe(5_000);
  });

  it("computes net per deal-hour", () => {
    const result = computeTimeValue(makeInput());
    // 5,000 / 97.5 ≈ $51.28
    expect(result.netPerDealHour).toBeCloseTo(51.28, 1);
  });

  it("computes break-even deal count", () => {
    const result = computeTimeValue(makeInput());
    // 30,000 / 10,417 ≈ 2.88 → ceil → 3
    expect(result.breakEvenDealCount).toBe(3);
  });

  it("computes cost per hour", () => {
    const result = computeTimeValue(makeInput());
    // 30,000 / 2,340 ≈ $12.82
    expect(result.costPerHour).toBeCloseTo(12.82, 1);
  });

  it("returns zeros when weekly hours is 0", () => {
    const result = computeTimeValue(makeInput({ estimatedWeeklyHours: 0 }));
    expect(result.effectiveHourlyRate).toBe(0);
    expect(result.grossHourlyRate).toBe(0);
    expect(result.annualHours).toBe(0);
    expect(result.costPerHour).toBe(0);
  });

  it("handles zero deal count gracefully", () => {
    const result = computeTimeValue(makeInput({ dealCount: 0 }));
    expect(result.revenuePerDeal).toBe(0);
    expect(result.hoursPerDeal).toBe(0);
    expect(result.netPerDeal).toBe(0);
    expect(result.netPerDealHour).toBe(0);
    expect(result.breakEvenDealCount).toBe(0);
  });

  it("handles year start (zero fraction elapsed)", () => {
    const result = computeTimeValue(makeInput({ yearFractionElapsed: 0 }));
    // Uses raw deal count when fraction is 0
    expect(result.revenuePerDeal).toBeGreaterThan(0);
  });

  it("higher hours = lower hourly rate for same income", () => {
    const low = computeTimeValue(makeInput({ estimatedWeeklyHours: 30 }));
    const high = computeTimeValue(makeInput({ estimatedWeeklyHours: 60 }));
    expect(low.effectiveHourlyRate).toBeGreaterThan(high.effectiveHourlyRate);
  });

  it("higher income = higher hourly rate for same hours", () => {
    const low = computeTimeValue(makeInput({ projectedAnnualNet: 80_000 }));
    const high = computeTimeValue(makeInput({ projectedAnnualNet: 200_000 }));
    expect(high.effectiveHourlyRate).toBeGreaterThan(low.effectiveHourlyRate);
  });

  // ── Vacation weeks ────────────────────────────────────────────────────
  it("vacation weeks reduce annual hours and increase hourly rate", () => {
    const noVacation = computeTimeValue(makeInput({ vacationWeeks: 0 }));
    const withVacation = computeTimeValue(makeInput({ vacationWeeks: 4 }));
    // 45 * (52 - 4) = 45 * 48 = 2,160
    expect(withVacation.annualHours).toBe(2160);
    expect(withVacation.workingWeeks).toBe(48);
    // Same income over fewer hours → higher hourly rate
    expect(withVacation.effectiveHourlyRate).toBeGreaterThan(noVacation.effectiveHourlyRate);
  });

  it("6 weeks vacation significantly changes hourly rate", () => {
    const result = computeTimeValue(makeInput({ vacationWeeks: 6 }));
    // 45 * 46 = 2,070 hours
    // 120,000 / 2,070 ≈ $57.97
    expect(result.annualHours).toBe(2070);
    expect(result.effectiveHourlyRate).toBeCloseTo(57.97, 0);
  });

  it("handles excessive vacation weeks gracefully", () => {
    const result = computeTimeValue(makeInput({ vacationWeeks: 52 }));
    expect(result.annualHours).toBe(0);
    expect(result.effectiveHourlyRate).toBe(0);
  });
});
