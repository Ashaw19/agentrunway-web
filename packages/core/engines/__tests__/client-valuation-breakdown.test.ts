import { describe, it, expect } from "vitest";
import {
  computeClientValuations,
  type ClientValuationInput,
} from "../client-valuation-engine";

const input: ClientValuationInput = {
  clients: [
    { clientId: "a", name: "Alpha", totalGCI: 50000, dealCount: 3, avgDeal: 16667, lastDeal: "2025-06-01", years: [2025, 2024, 2023] },
    { clientId: "b", name: "Bravo", totalGCI: 20000, dealCount: 1, avgDeal: 20000, lastDeal: "2024-03-01", years: [2024] },
  ],
  totalGCI: 70000,
  monthlyBurn: 5000,
  province: "ontario",
  netIncome: 90000,
  agentExperienceYears: 5,
};

describe("computeClientValuations — compositeBreakdown", () => {
  const { valuations } = computeClientValuations(input);

  it("returns a breakdown for every client", () => {
    expect(valuations).toHaveLength(2);
    for (const v of valuations) expect(v.compositeBreakdown).toBeDefined();
  });

  it("breakdown sums (rounded) to the composite score", () => {
    for (const v of valuations) {
      const b = v.compositeBreakdown;
      const sum = b.lgv + b.health + b.runway + b.velocity + b.tax;
      expect(Math.round(sum)).toBe(v.compositeScore);
    }
  });

  it("each factor's contribution is non-negative and capped by its weight (norm ≤ 100)", () => {
    const CAP = { lgv: 40, health: 20, runway: 15, velocity: 15, tax: 10 };
    for (const v of valuations) {
      const b = v.compositeBreakdown;
      for (const k of ["lgv", "health", "runway", "velocity", "tax"] as const) {
        expect(b[k]).toBeGreaterThanOrEqual(0);
        expect(b[k]).toBeLessThanOrEqual(CAP[k] + 1e-9);
      }
    }
  });

  it("a single-deal client gets the documented velocity fallback (25 norm × 0.15 = 3.75)", () => {
    const bravo = valuations.find((v) => v.name === "Bravo");
    expect(bravo).toBeDefined();
    expect(bravo!.velocityDays).toBeNull();
    expect(bravo!.compositeBreakdown.velocity).toBeCloseTo(3.75, 9);
  });
});
