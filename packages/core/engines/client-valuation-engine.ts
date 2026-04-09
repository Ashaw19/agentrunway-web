// ClientValuationEngine — computes per-client business metrics
// Transforms CRM contacts into quantified portfolio assets using existing
// GCI data, runway calculations, and tax engine outputs.
//
// ESTIMATE ONLY — Not legal, tax, or financial advice.

import type { Province } from "../types/database";
import { marginalRate } from "./canadian-tax-engine";

// ── Input Types ──────────────────────────────────────────────────────────────

export interface ClientGroupInput {
  clientId: string | null;
  name: string;
  totalGCI: number;
  dealCount: number;
  avgDeal: number;
  lastDeal: string | null; // ISO date
  years: number[]; // e.g. [2025, 2024]
}

export interface ClientValuationInput {
  clients: ClientGroupInput[];
  totalGCI: number;
  monthlyBurn: number; // from survivalResult
  province: Province;
  netIncome: number; // for marginalRate()
  agentExperienceYears: number | null;
}

// ── Output Types ─────────────────────────────────────────────────────────────

export type ClientTier = "platinum" | "gold" | "silver" | "bronze";

export interface ClientValuation {
  clientId: string | null;
  name: string;
  lifetimeGCI: number;
  lgv: number; // forward-looking lifetime value
  runwayImpactMonths: number; // "this client = X months of runway"
  taxEfficiencyCents: number; // 0-100 (cents after tax per $1 GCI)
  velocityDays: number | null; // avg days between deals (null = single deal)
  healthContributionPct: number; // % of total GCI
  compositeScore: number; // 0-100 weighted
  tier: ClientTier;
  insights: string[];
}

export type PortfolioHealth = "Concentrated" | "Balanced" | "Diversified";

export interface ClientValuationResult {
  valuations: ClientValuation[];
  totalLGV: number;
  top12PctGCI: number; // what % of GCI the top 12% generate
  portfolioHealth: PortfolioHealth;
}

// ── Main Calculation ─────────────────────────────────────────────────────────

export function computeClientValuations(
  input: ClientValuationInput,
  clientsMetadata?: Map<string, { lastContactAt: string | null }>,
): ClientValuationResult {
  const { clients, totalGCI, monthlyBurn, province, netIncome } = input;

  if (clients.length === 0 || totalGCI <= 0) {
    return {
      valuations: [],
      totalLGV: 0,
      top12PctGCI: 0,
      portfolioHealth: "Diversified",
    };
  }

  // Tax efficiency is the same for all clients (same marginal bracket)
  const margRate = netIncome > 0 ? marginalRate(netIncome, province) : 0;
  const taxEffCents = Math.round((1 - margRate) * 100);

  const now = new Date();
  const currentYear = now.getFullYear();

  // Compute raw valuations
  const raw = clients.map((c) => {
    const lgv = computeLGV(c, currentYear);
    const runwayMonths = computeRunwayImpact(c.totalGCI, monthlyBurn);
    const velocity = computeVelocity(c);
    const healthPct =
      totalGCI > 0
        ? Math.round((c.totalGCI / totalGCI) * 1000) / 10
        : 0;
    const insights = generateInsights(c, healthPct, clientsMetadata, now);

    return {
      clientId: c.clientId,
      name: c.name,
      lifetimeGCI: c.totalGCI,
      lgv,
      runwayImpactMonths: runwayMonths,
      taxEfficiencyCents: taxEffCents,
      velocityDays: velocity,
      healthContributionPct: healthPct,
      compositeScore: 0, // computed after normalization
      tier: "bronze" as ClientTier,
      insights,
    };
  });

  // Normalize and compute composite scores
  const maxLGV = Math.max(...raw.map((r) => r.lgv), 1);
  const maxHealth = Math.max(...raw.map((r) => r.healthContributionPct), 1);
  const maxRunway = Math.max(...raw.map((r) => r.runwayImpactMonths), 1);
  // For velocity, lower is better — invert the scale
  const velocities = raw.map((r) => r.velocityDays).filter((v): v is number => v !== null);
  const maxVelocity = velocities.length > 0 ? Math.max(...velocities) : 1;

  for (const v of raw) {
    const lgvNorm = (v.lgv / maxLGV) * 100;
    const healthNorm = (v.healthContributionPct / maxHealth) * 100;
    const runwayNorm = (v.runwayImpactMonths / maxRunway) * 100;
    // Velocity: lower days = better, so invert. null (single deal) gets 25/100
    const velocityNorm =
      v.velocityDays !== null && maxVelocity > 0
        ? ((maxVelocity - v.velocityDays) / maxVelocity) * 100
        : 25;
    const taxNorm = v.taxEfficiencyCents; // already 0-100

    v.compositeScore = Math.round(
      lgvNorm * 0.4 +
        healthNorm * 0.2 +
        runwayNorm * 0.15 +
        velocityNorm * 0.15 +
        taxNorm * 0.1,
    );
  }

  // Sort by composite score descending
  raw.sort((a, b) => b.compositeScore - a.compositeScore);

  // Assign tiers based on position
  const n = raw.length;
  for (let i = 0; i < n; i++) {
    const pct = (i + 1) / n;
    if (pct <= 0.10) raw[i].tier = "platinum";
    else if (pct <= 0.25) raw[i].tier = "gold";
    else if (pct <= 0.50) raw[i].tier = "silver";
    else raw[i].tier = "bronze";
  }

  // Ensure at least 1 platinum if there are clients
  if (n > 0 && !raw.some((v) => v.tier === "platinum")) {
    raw[0].tier = "platinum";
  }

  // Portfolio-level metrics
  const totalLGV = Math.round(raw.reduce((s, v) => s + v.lgv, 0));
  const top12Count = Math.max(1, Math.ceil(n * 0.12));
  const top12GCI = raw.slice(0, top12Count).reduce((s, v) => s + v.lifetimeGCI, 0);
  const top12PctGCI = totalGCI > 0 ? Math.round((top12GCI / totalGCI) * 100) : 0;

  // Portfolio health
  const top1Pct = n > 0 && totalGCI > 0 ? (raw[0].lifetimeGCI / totalGCI) * 100 : 0;
  const top3Pct =
    n >= 3 && totalGCI > 0
      ? (raw.slice(0, 3).reduce((s, v) => s + v.lifetimeGCI, 0) / totalGCI) * 100
      : top1Pct;
  let portfolioHealth: PortfolioHealth;
  if (top1Pct > 40 || top3Pct > 70) portfolioHealth = "Concentrated";
  else if (top3Pct > 50) portfolioHealth = "Balanced";
  else portfolioHealth = "Diversified";

  return {
    valuations: raw,
    totalLGV,
    top12PctGCI,
    portfolioHealth,
  };
}

// ── LGV (Lifetime GCI Value) ────────────────────────────────────────────────

function computeLGV(client: ClientGroupInput, currentYear: number): number {
  const { totalGCI, avgDeal, dealCount, lastDeal, years } = client;

  // Repeat probability
  let repeatProb: number;
  if (dealCount > 1) {
    repeatProb = 0.6;
  } else if (lastDeal) {
    const lastDate = new Date(lastDeal + "T12:00:00");
    const yearsSinceLast =
      (Date.now() - lastDate.getTime()) / (365.25 * 86400000);
    repeatProb = yearsSinceLast < 2 ? 0.3 : 0.1;
  } else {
    repeatProb = 0.1;
  }

  // Estimated remaining years as client
  const firstYear = years.length > 0 ? Math.min(...years) : currentYear;
  const yearsAsClient = Math.max(1, currentYear - firstYear + 1);
  const remainingYears = Math.max(3, 10 - yearsAsClient);

  // Forward-looking value
  const futureValue = avgDeal * repeatProb * remainingYears;
  return Math.round(totalGCI + futureValue);
}

// ── Runway Impact ───────────────────────────────────────────────────────────

function computeRunwayImpact(
  clientGCI: number,
  monthlyBurn: number,
): number {
  if (monthlyBurn <= 0) return 0;
  const annualBurn = monthlyBurn * 12;
  // This client's GCI as proportion of annual burn, converted to months
  return Math.round(((clientGCI / annualBurn) * 12) * 10) / 10;
}

// ── Velocity ────────────────────────────────────────────────────────────────

function computeVelocity(client: ClientGroupInput): number | null {
  if (client.dealCount < 2) return null;

  const years = client.years;
  if (years.length < 2) {
    // Multiple deals in same year — estimate ~180 days average
    return Math.round(365 / client.dealCount);
  }

  const firstYear = Math.min(...years);
  const lastYear = Math.max(...years);
  const spanDays = (lastYear - firstYear) * 365;
  if (spanDays <= 0) return Math.round(365 / client.dealCount);

  return Math.round(spanDays / (client.dealCount - 1));
}

// ── Insights Generator ──────────────────────────────────────────────────────

function generateInsights(
  client: ClientGroupInput,
  healthPct: number,
  metadata: Map<string, { lastContactAt: string | null }> | undefined,
  now: Date,
): string[] {
  const insights: string[] = [];

  // Top revenue driver
  if (healthPct > 15) {
    insights.push("Top revenue driver — protect this relationship");
  }

  // Repeat client loyalty
  if (client.dealCount > 2) {
    insights.push("Repeat client — high loyalty signal");
  }

  // No contact warning
  if (client.clientId && metadata) {
    const meta = metadata.get(client.clientId);
    if (meta?.lastContactAt) {
      const lastContact = new Date(meta.lastContactAt);
      const monthsSince =
        (now.getTime() - lastContact.getTime()) / (30.44 * 86400000);
      if (monthsSince > 6) {
        insights.push(
          `No contact in ${Math.round(monthsSince)} months — LGV at risk`,
        );
      }
    }
  }

  // Re-engagement opportunity
  if (client.dealCount === 1 && client.lastDeal) {
    const lastDate = new Date(client.lastDeal + "T12:00:00");
    const yearsSince =
      (now.getTime() - lastDate.getTime()) / (365.25 * 86400000);
    if (yearsSince > 2) {
      insights.push("Single deal over 2 years ago — re-engagement opportunity");
    }
  }

  return insights.slice(0, 3);
}

// ── Tier Display Helpers ────────────────────────────────────────────────────

export const TIER_CONFIG: Record<
  ClientTier,
  { label: string; color: string; bg: string; border: string }
> = {
  platinum: {
    label: "Platinum",
    color: "text-slate-700",
    bg: "bg-gradient-to-r from-slate-100 to-slate-200",
    border: "border-slate-300",
  },
  gold: {
    label: "Gold",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  silver: {
    label: "Silver",
    color: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
  bronze: {
    label: "Bronze",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
};
