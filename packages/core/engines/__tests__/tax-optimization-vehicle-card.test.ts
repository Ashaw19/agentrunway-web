/**
 * The vehicle tax card is information only (2026-10-19).
 *
 * Its "savings" was the tax value of km × CRA's per-km allowance rates. A
 * self-employed agent cannot claim that (the T2125 vehicle deduction is the
 * business part of actual vehicle costs), and it fed totalEstimatedSavings,
 * printed as "Estimated ~$X/yr in potential savings" on the dashboard,
 * Forecast, Overhead and the T2125 PDF: about $3,900 a year with no trips
 * logged (20,000 placeholder km × 80% at $0.73/$0.67 × a marginal rate).
 */
import { describe, expect, it } from "vitest";
import { generateTaxOptimizations, type TaxOptimizationInput } from "../tax-optimization-engine";

const INPUT: TaxOptimizationInput = {
  netIncome: 90_000,
  projectedGCI: 120_000,
  annualExpenses: 30_000,
  dealCount: 10,
  province: "newBrunswick",
  experienceYears: 5,
  isIncorporated: false,
  corpType: null,
  compensationMethod: "salary",
  homeOfficeSqFootage: null,
  homeOfficeBusinessUsePct: 0,
  homeOfficeRentMonthly: 0,
  homeOfficeUtilitiesMonthly: 0,
  homeOfficePropertyTaxAnnual: 0,
  homeOfficeInsuranceMonthly: 0,
  homeOfficeMaintenanceAnnual: 0,
  homeOfficeCondoFeesMonthly: 0,
  vehicleType: "lease",
  vehicleBusinessUsePct: 0.8,
  hasTrackedMileage: false,
  annualMileageKm: 0,
  gstHstRegistered: true,
  gstHstPaidOnExpenses: 0,
  gstHstRemitted: 0,
  taxInstalmentsPaid: 0,
  cppInstalmentPaidYTD: 0,
  hasProfDevExpenses: true,
  hasMarketingExpenses: true,
  hasClientGiftExpenses: true,
  hasMealExpenses: true,
  hasLicensingExpenses: true,
  ccaAssetCount: 1,
  dismissed: [],
};

const vehicleCard = (r: ReturnType<typeof generateTaxOptimizations>) => r.cards.find((c) => c.id === "vehicleExpenseOptimizer");

describe("the vehicle tax card", () => {
  it.each([
    ["no trips logged", { hasTrackedMileage: false, annualMileageKm: 0 }],
    ["trips logged", { hasTrackedMileage: true, annualMileageKm: 12_000 }],
  ])("%s: shown as information, with no savings", (_name, mileage) => {
    const r = generateTaxOptimizations({ ...INPUT, ...mileage }, 20);
    const card = vehicleCard(r);
    expect(card).toBeDefined();
    expect(card!.estimatedSavings).toBe(0);
    expect(card!.estimatedSavingsLabel).toBe("Information");
    expect(card!.evidence.join(" ")).not.toMatch(/of tax|tax reduction|potential deduction/i);
  });

  it("adds nothing to the total potential savings", () => {
    const withVehicle = generateTaxOptimizations(INPUT, 20);
    const without = generateTaxOptimizations({ ...INPUT, vehicleType: "none" }, 20);
    expect(withVehicle.totalEstimatedSavings).toBe(without.totalEstimatedSavings);
  });

  it("never calls the per-km figure a deduction", () => {
    const card = vehicleCard(generateTaxOptimizations({ ...INPUT, hasTrackedMileage: true, annualMileageKm: 6_000 }, 20))!;
    expect(card.evidence[0]).toMatch(/employer allowance benchmark, shown for scale, not a deduction/);
  });
});
