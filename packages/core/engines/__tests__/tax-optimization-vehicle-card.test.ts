/**
 * The vehicle tax card is information only (2026-10-19).
 *
 * Its "savings" was the tax value of km × CRA's per-km allowance rates. A
 * self-employed agent cannot claim that (the T2125 vehicle deduction is the
 * business part of actual vehicle costs), and it fed totalEstimatedSavings,
 * printed as "Estimated ~$X/yr in potential savings" on the dashboard,
 * Forecast, Overhead and the T2125 PDF: about $3,900 a year with no trips
 * logged (20,000 placeholder km × 80% at $0.73/$0.67 × a marginal rate).
 *
 * 2026-10-21: the card shows no dollar figure at all. It had kept
 * "km × CRA's per-km allowance rates" as an employer benchmark "for scale",
 * a figure that doesn't apply to a self-employed agent and reads like a
 * deduction on a tax card. It states the km logged, the business-use share
 * applied to vehicle costs, and where the deduction is (Expenses → Vehicle,
 * T2125 line 9281).
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
  taxYear: 2026,
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

  it("names the tax year and the km logged", () => {
    const y2025 = vehicleCard(generateTaxOptimizations({ ...INPUT, taxYear: 2025, hasTrackedMileage: true, annualMileageKm: 6_000 }, 20))!;
    expect(y2025.title).toBe("Vehicle: Business Kilometres Logged in 2025");
    expect(y2025.evidence[0]).toBe("6,000 business km logged in 2025");
  });

  it("is not an opportunity: left out of the savings count", () => {
    const r = generateTaxOptimizations(INPUT, 20);
    expect(vehicleCard(r)!.informational).toBe(true);
    expect(r.savingsCardCount).toBe(r.cardCount - 1);
  });

  it("adds nothing to the total potential savings", () => {
    const withVehicle = generateTaxOptimizations(INPUT, 20);
    const without = generateTaxOptimizations({ ...INPUT, vehicleType: "none" }, 20);
    expect(withVehicle.totalEstimatedSavings).toBe(without.totalEstimatedSavings);
  });

  it.each([
    ["no trips logged", { hasTrackedMileage: false, annualMileageKm: 0 }],
    ["trips logged", { hasTrackedMileage: true, annualMileageKm: 6_000 }],
  ])("%s: no dollar figure and no per-km rate anywhere on the card", (_name, mileage) => {
    const card = vehicleCard(generateTaxOptimizations({ ...INPUT, ...mileage }, 20))!;
    const text = [card.title, ...card.evidence, card.action, card.disclaimer].join(" ");
    expect(text).not.toMatch(/\$/);
    // ("capital cost allowance", CRA's term for depreciation, is a real deduction and stays.)
    expect(text).not.toMatch(/per-km|allowance rate|allowance benchmark|reasonable allowance/i);
  });

  it("says where the deduction is: the business part of actual vehicle costs", () => {
    const card = vehicleCard(generateTaxOptimizations({ ...INPUT, hasTrackedMileage: true, annualMileageKm: 6_000 }, 20))!;
    expect(card.evidence[1]).toBe("Vehicle business-use share applied to vehicle costs: 80%");
    expect(card.action).toMatch(/business part of actual vehicle costs/);
    expect(card.action).toMatch(/T2125 line 9281/);
    expect(card.disclaimer).toMatch(/^Information only\./);
  });
});
