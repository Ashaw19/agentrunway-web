/**
 * Regression guards for the beta → paid conversion path.
 *
 * Context — Ellis launch 2026-06-26
 * ---------------------------------
 * Beta orgs grant free Pro AND hard-refuse billing. To take Ellis to a paid
 * subscription we flip `organizations.is_beta = false`, which un-gates the
 * Subscribe-Team CTA so the owner can reach Stripe Checkout. The danger is an
 * ACCESS GAP: while is_beta is false and before a subscription is active a
 * member could drop from Pro to starter.
 *
 * These are source-level invariants (we can't drive Stripe or a real org from
 * a unit test — the local key is live and the constraint bars touching it). If
 * any of these fail, read lib/actions/beta-conversion.ts before "fixing".
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const LIB = path.resolve(__dirname, "..");
const APP = path.resolve(__dirname, "../../../app");
const COMPONENTS = path.resolve(__dirname, "../../../components");

const conversionSrc = readFileSync(path.join(LIB, "beta-conversion.ts"), "utf8");
const settingsSrc = readFileSync(
  path.join(APP, "(app)/org/settings/org-settings-content.tsx"),
  "utf8",
);
const billingSrc = readFileSync(
  path.join(APP, "(app)/org/billing/billing-content.tsx"),
  "utf8",
);
const subscribeBtnSrc = readFileSync(
  path.join(COMPONENTS, "team-subscribe-button.tsx"),
  "utf8",
);
const checkoutSrc = readFileSync(
  path.join(APP, "api/create-team-checkout/route.ts"),
  "utf8",
);

describe("beta-conversion action — gap safety + authz", () => {
  it("only the owner can flip is_beta (no admin/agent/self-service path)", () => {
    // verifyOwner must require role === 'owner' AND status === 'active'.
    expect(conversionSrc).toMatch(/\.eq\(\s*["']role["']\s*,\s*["']owner["']\s*\)/);
    expect(conversionSrc).toMatch(/\.eq\(\s*["']status["']\s*,\s*["']active["']\s*\)/);
  });

  it("never flips is_beta without writing an audit-log row", () => {
    // The audit call and the is_beta=false write must both exist in the
    // convert function. We assert the audit event type is recorded.
    expect(conversionSrc).toContain("is_beta: false");
    expect(conversionSrc).toContain("org_beta_converted");
    expect(conversionSrc).toContain("logAuditEvent");
  });

  it("flip is guarded against a concurrent double-flip", () => {
    // update(...).eq('is_beta', true) so two racing flips don't both 'win'.
    expect(conversionSrc).toMatch(/\.update\(\{[\s\S]*is_beta:\s*false[\s\S]*\}\)[\s\S]*\.eq\(\s*["']is_beta["']\s*,\s*true\s*\)/);
  });

  it("the conversion does NOT touch Stripe (DB-flag only — webhook owns money)", () => {
    expect(conversionSrc).not.toContain("stripe.");
    expect(conversionSrc).not.toContain("checkout.sessions");
    expect(conversionSrc).not.toContain("subscriptions.create");
  });

  it("conversion is reversible (revertOrgToBeta restores free access)", () => {
    expect(conversionSrc).toContain("export async function revertOrgToBeta");
    expect(conversionSrc).toContain("is_beta: true");
    // Reverting clears the conversion provenance.
    expect(conversionSrc).toContain("beta_converted_at: null");
  });

  it("convert + revert are idempotent no-ops (read is_beta before writing)", () => {
    expect(conversionSrc).toContain("alreadyConverted");
    expect(conversionSrc).toContain("alreadyBeta");
  });

  it("billing-state writes go through the admin (service-role) client", () => {
    expect(conversionSrc).toContain("createAdminClient");
  });
});

describe("UI un-gating — Subscribe CTA is reachable", () => {
  it("settings page renders a subscribe affordance for a beta owner", () => {
    // The previous code hid ALL billing CTAs behind {!org.is_beta}. After the
    // change a beta OWNER must get a Start-Subscription affordance.
    expect(settingsSrc).toContain("TeamSubscribeButton");
    expect(settingsSrc).toMatch(/org\.is_beta\s*&&\s*isOwner/);
  });

  it("billing page renders a subscribe affordance for a beta owner", () => {
    expect(billingSrc).toContain("TeamSubscribeButton");
    expect(billingSrc).toMatch(/org\.is_beta\s*&&\s*isOwner/);
  });

  it("no surface still advertises 'Lifetime Free' (legal removed that wording)", () => {
    expect(settingsSrc).not.toContain("Lifetime Free");
    expect(billingSrc).not.toContain("Lifetime Free");
  });

  it("subscribe button converts the beta org BEFORE starting checkout", () => {
    // The order matters: flip is_beta=false (so checkout isn't 200-refused),
    // THEN call create-team-checkout.
    const convertIdx = subscribeBtnSrc.indexOf("convertBetaOrgToPaid");
    const checkoutIdx = subscribeBtnSrc.indexOf("create-team-checkout");
    expect(convertIdx).toBeGreaterThan(-1);
    expect(checkoutIdx).toBeGreaterThan(-1);
    expect(convertIdx).toBeLessThan(checkoutIdx);
  });

  it("subscribe button bills members = activeMemberCount - 1 (leader seat excluded)", () => {
    expect(subscribeBtnSrc).toContain("Math.max(0, activeMemberCount - 1)");
  });

  it("subscribe button surfaces the 503 'payments not activated' state to the user", () => {
    expect(subscribeBtnSrc).toContain("503");
  });
});

describe("price-lock intent — charter team rate is applied", () => {
  it("checkout resolves leader + member price IDs via the tier resolvers", () => {
    // getLeaderPriceId / getMemberPriceId resolve charter-tier first while
    // paid count < 50, which is the Ellis locked rate.
    expect(checkoutSrc).toContain("getLeaderPriceId");
    expect(checkoutSrc).toContain("getMemberPriceId");
    expect(checkoutSrc).toContain("getCurrentPricingTier");
  });

  it("the 14-day trial with payment_method_collection:if_required is intact", () => {
    // Andrew's goal is card-on-file / commitment, not immediate capture.
    expect(checkoutSrc).toContain("trial_period_days: 14");
    expect(checkoutSrc).toContain('payment_method_collection: "if_required"');
  });

  it("checkout still hard-refuses while the org is beta (flip must precede it)", () => {
    // This is WHY the subscribe button converts first. Keep the guard.
    expect(checkoutSrc).toContain("Beta organizations have free access");
  });
});
