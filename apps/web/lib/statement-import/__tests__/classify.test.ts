/**
 * Statement line estimates by rule (classify.ts) and from the model's
 * answer (classify-model.ts readModelClassifications). Synthetic lines.
 */
import { describe, expect, it } from "vitest";
import { classifyByRules, unclassified, type ClassifyInput } from "../classify";
import { ModelClassificationSchema, readModelClassifications } from "../classify-model";
import { RECEIPT_CATEGORY_KEYS, isReceiptCategoryKey } from "@/lib/types/receipt";
import { validateTaxCopy } from "@agent-runway/core/tax-copy";

const out = (description: string, extra: Partial<ClassifyInput> = {}): ClassifyInput => ({
  description, merchant: null, amount: 25, direction: "out", sourceCategory: null, sourceBusiness: null, ...extra,
});

describe("classifyByRules", () => {
  it("money in is never an expense: payments, transfers, refunds and deposits start skipped", () => {
    expect(classifyByRules(out("PAYMENT - THANK YOU", { direction: "in" }))).toMatchObject({ status: "skipped", skipReason: "payment", suggestedCategoryKey: null, businessLikelihood: 0 });
    expect(classifyByRules(out("E-TRANSFER RECEIVED", { direction: "in" }))).toMatchObject({ skipReason: "transfer" });
    expect(classifyByRules(out("AMAZON REFUND", { direction: "in" }))).toMatchObject({ skipReason: "income" });
    expect(classifyByRules(out("PAYROLL DEPOSIT ACME", { direction: "in" }))).toMatchObject({ skipReason: "income" });
  });

  it("card payments, tax remittances, transfers, loans and cash start skipped", () => {
    expect(classifyByRules(out("ONLINE BANKING PAYMENT - VISA"))).toMatchObject({ status: "skipped", skipReason: "payment" });
    expect(classifyByRules(out("CRA GST/HST PAYMENT"))).toMatchObject({ status: "skipped", skipReason: "payment" });
    expect(classifyByRules(out("SEND E-TFR A FRIEND"))).toMatchObject({ status: "skipped", skipReason: "transfer" });
    expect(classifyByRules(out("MORTGAGE PAYMENT"))).toMatchObject({ status: "skipped", skipReason: "transfer" });
    expect(classifyByRules(out("ATM WITHDRAWAL"))).toMatchObject({ status: "skipped", skipReason: "transfer" });
  });

  it.each([
    "INTERNET BILL PAY CIBC VISA",
    "MB-CREDIT CARD/LOC PAY.",
    "PAYMENT MBNA",
    "BMO MC PAYMENT",
    "ONLINE BANKING PAYMENT - VISA",
    "TD VISA PAYMENT",
    "PAIEMENT CARTE DE CREDIT",
    "AMEX BILL PAYMENT",
  ])("%s is a card payment from the bank account, skipped", (d) => {
    expect(classifyByRules(out(d))).toMatchObject({ status: "skipped", skipReason: "payment" });
  });

  it("a merchant with a card word in its name is not a card payment", () => {
    expect(classifyByRules(out("ROGERS WIRELESS"))?.skipReason ?? null).not.toBe("payment");
    expect(classifyByRules(out("MCDONALD'S #4411"))?.skipReason ?? null).not.toBe("payment");
  });

  it("a pre-authorized withdrawal is not read as cash", () => {
    expect(classifyByRules(out("PRE-AUTHORIZED WITHDRAWAL E&O INSURANCE"))?.skipReason).not.toBe("transfer");
  });

  it("personal-looking merchants start skipped as personal", () => {
    for (const d of ["SOBEYS #123", "SHOPPERS DRUG MART", "NETFLIX.COM", "ANBL STORE 44"]) {
      expect(classifyByRules(out(d)), d).toMatchObject({ status: "skipped", skipReason: "personal", suggestedCategoryKey: null });
    }
  });

  it("the receipt form's merchant hints give the category, with a likelihood by item", () => {
    expect(classifyByRules(out("SHELL C12345"))).toMatchObject({ suggestedCategoryKey: "vehicle_fuel", categorySource: "hint", status: "pending", businessLikelihood: 0.65 });
    expect(classifyByRules(out("CANVA* SUBSCRIPTION"))).toMatchObject({ suggestedCategoryKey: "office_software", businessLikelihood: 0.75 });
    expect(classifyByRules(out("TIM HORTONS #0912"))).toMatchObject({ suggestedCategoryKey: "meals_client", businessLikelihood: 0.45 });
  });

  it("a big-box store is held at 40%: it could be either", () => {
    expect(classifyByRules(out("WALMART SUPERCENTER 3021"))).toMatchObject({ suggestedCategoryKey: "office_supplies", businessLikelihood: 0.4, status: "pending" });
  });

  it("a home bill says only the home office share counts", () => {
    const c = classifyByRules(out("NB POWER BILL PAYMENT"));
    expect(c).toMatchObject({ suggestedCategoryKey: "home_utilities" });
    expect(c?.likelihoodReason).toMatch(/home office share/);
  });

  it("bank and card fees go to Miscellaneous", () => {
    expect(classifyByRules(out("MONTHLY ACCOUNT FEE"))).toMatchObject({ suggestedCategoryKey: "other_misc", businessLikelihood: 0.5 });
    expect(classifyByRules(out("PURCHASE INTEREST"))).toMatchObject({ suggestedCategoryKey: "other_misc" });
  });

  it("the export's Business/Personal flag and category are used (QuickBooks Self-Employed)", () => {
    expect(classifyByRules(out("GROCERY CO", { sourceBusiness: false }))).toMatchObject({ status: "skipped", skipReason: "personal" });
    expect(classifyByRules(out("ACME THING", { sourceBusiness: true, sourceCategory: "Office expenses" }))).toMatchObject({ suggestedCategoryKey: "office_supplies", categorySource: "statement", businessLikelihood: 0.9 });
    expect(classifyByRules(out("FUEL MART 22", { sourceBusiness: true }))).toMatchObject({ suggestedCategoryKey: "vehicle_fuel", businessLikelihood: 0.9 });
  });

  it("an unknown merchant is left for the model", () => {
    expect(classifyByRules(out("ZQX HOLDINGS 4411"))).toBeNull();
    expect(unclassified()).toMatchObject({ status: "pending", suggestedCategoryKey: null, businessLikelihood: null });
  });

  it("every suggested key is an expense item key, and every reason is information, not advice", () => {
    const samples = ["SHELL", "CANVA", "STAPLES", "REALTOR.CA DUES", "UDEMY", "TICKETMASTER", "NB POWER", "MONTHLY FEE", "SOBEYS", "PAYMENT", "CRA", "E-TRANSFER"];
    for (const d of samples) {
      for (const direction of ["out", "in"] as const) {
        const c = classifyByRules(out(d, { direction }));
        if (!c) continue;
        if (c.suggestedCategoryKey) expect(isReceiptCategoryKey(c.suggestedCategoryKey), d).toBe(true);
        expect(validateTaxCopy(c.likelihoodReason).filter((x) => x.level === "error"), `${d}: ${c.likelihoodReason}`).toEqual([]);
      }
    }
  });
});

describe("readModelClassifications", () => {
  it("keeps only indexes in the batch, once each; clamps the likelihood; checks keys", () => {
    const got = readModelClassifications({
      lines: [
        { index: 0, category_key: "marketing_ads", business_likelihood: 1.7, reason: "An advertising platform" },
        { index: 0, category_key: "office_supplies", business_likelihood: 0.5, reason: "repeat" },
        { index: 1, category_key: null, business_likelihood: 0.1, reason: "A grocery store" },
        { index: 7, category_key: "office_supplies", business_likelihood: 0.5, reason: "out of range" },
        { index: 2, category_key: "edu_books", business_likelihood: Number.NaN, reason: "You should claim this" },
      ],
    }, 3);
    expect([...got.keys()]).toEqual([0, 1, 2]);
    expect(got.get(0)).toMatchObject({ suggestedCategoryKey: "marketing_ads", businessLikelihood: 1, status: "pending", categorySource: "model", likelihoodReason: "An advertising platform." });
    expect(got.get(1)).toMatchObject({ suggestedCategoryKey: null, businessLikelihood: 0.1, status: "skipped", skipReason: "personal" });
    // Advice-shaped wording is replaced; no number means no estimate.
    expect(got.get(2)).toMatchObject({ businessLikelihood: null, likelihoodReason: "Estimated from the merchant name." });
  });

  it("the structured-output schema's key enum is the receipt form's list", () => {
    const shape = ModelClassificationSchema.shape.lines.element.shape.category_key;
    const parsed = shape.safeParse("not_a_key");
    expect(parsed.success).toBe(false);
    for (const key of RECEIPT_CATEGORY_KEYS) expect(shape.safeParse(key).success).toBe(true);
    expect(shape.safeParse(null).success).toBe(true);
  });
});
