/**
 * EVAL: GST/HST rate consistency by province.
 *
 * One rate per province, the same everywhere it appears: the core engine,
 * the connector's copy (MCP hst-engine.ts, kept by hand), the CRA rule copy
 * (HST_RATE_GROUPS, GST_RATE_GROUP, GST_HST_RATE_RULE), the percent the app
 * prints, the knowledge base Flight Crew reads, and the receipt check's
 * ceiling. Checked against CRA's published rates (canada.ca, "GST/HST
 * rates": charge-collect-which-rate). Nova Scotia went from 15% to 14% on
 * 2025-04-01. Quebec is GST 5% + QST 9.975%.
 *
 * A GST/HST AMOUNT is never derived from these rates anywhere in the app;
 * this eval is about the rates themselves.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gstHstLabel, gstHstRate } from "@agent-runway/core/engines/canadian-tax-engine";
import {
  GST_HST_RATE_RULE,
  GST_RATE_GROUP,
  HST_RATE_GROUPS,
  fmtGstHstRate,
  gstHstRatePercent,
} from "@agent-runway/core/tax-copy/cra-rules";
import { PROVINCE_ISO_CODES, PROVINCE_LABELS, type Province } from "@agent-runway/core/types/database";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { MAX_SALES_TAX_RATE } from "@/lib/receipts/check-amounts";

/** CRA's rates on a commission, by province (the reference this eval holds every copy to). */
const CRA: Record<Province, { rate: number; label: string }> = {
  alberta: { rate: 0.05, label: "GST" },
  britishColumbia: { rate: 0.05, label: "GST" },
  manitoba: { rate: 0.05, label: "GST" },
  saskatchewan: { rate: 0.05, label: "GST" },
  northwestTerritories: { rate: 0.05, label: "GST" },
  nunavut: { rate: 0.05, label: "GST" },
  yukon: { rate: 0.05, label: "GST" },
  ontario: { rate: 0.13, label: "HST" },
  novaScotia: { rate: 0.14, label: "HST" },
  newBrunswick: { rate: 0.15, label: "HST" },
  newfoundland: { rate: 0.15, label: "HST" },
  princeEdwardIsland: { rate: 0.15, label: "HST" },
  quebec: { rate: 0.14975, label: "GST + QST" },
};

const PROVINCES = Object.keys(PROVINCE_LABELS) as Province[];

describe("EVAL GST/HST: one rate per province everywhere", () => {
  it("covers every province and territory", () => {
    expect(PROVINCES.sort()).toEqual((Object.keys(CRA) as Province[]).sort());
  });

  it.each(PROVINCES)("%s: core engine rate and label match CRA", (p) => {
    expect(gstHstRate(p)).toBe(CRA[p].rate);
    expect(gstHstLabel(p)).toBe(CRA[p].label);
    expect(gstHstRatePercent(p)).toBe(fmtGstHstRate(CRA[p].rate));
  });

  it("the connector's copy (MCP hst-engine.ts) matches the core engine for every province", async () => {
    // Loaded by computed path: supabase/functions is Deno code outside tsconfig.
    const file = path.resolve(__dirname, "../../supabase/functions/mcp-server/lib/hst-engine.ts");
    const mcp = (await import(/* @vite-ignore */ file)) as { gstHstRate: (p: string) => number; gstHstLabel: (p: string) => string };
    for (const p of PROVINCES) {
      expect({ p, rate: mcp.gstHstRate(p), label: mcp.gstHstLabel(p) }).toEqual({ p, rate: gstHstRate(p), label: gstHstLabel(p) });
    }
  });

  it("HST_RATE_GROUPS and GST_RATE_GROUP put each province in exactly one group, at its rate", () => {
    const seen = new Map<Province, number>();
    for (const g of [...HST_RATE_GROUPS, GST_RATE_GROUP]) {
      for (const p of g.provinces) {
        expect(seen.has(p), p).toBe(false);
        seen.set(p, g.rate);
        expect(g.rate, p).toBe(CRA[p].rate);
      }
    }
    // Quebec (GST + QST) is in neither group.
    expect([...seen.keys()].sort()).toEqual(PROVINCES.filter((p) => p !== "quebec").sort());
  });

  it("CRA's rule sentence states every HST rate with its provinces", () => {
    for (const g of HST_RATE_GROUPS) expect(GST_HST_RATE_RULE).toContain(`${g.percent} HST in ${g.names}`);
    expect(GST_HST_RATE_RULE).toContain(`${GST_RATE_GROUP.percent} GST`);
  });

  it("the knowledge base Flight Crew reads states the same rates", () => {
    const line = KNOWLEDGE_BASE.split("\n").find((l) => l.startsWith("**GST/HST:**"));
    expect(line).toBeDefined();
    const stated = new Map<string, number>();
    for (const m of line!.matchAll(/(\d+)%\(([A-Za-z,]+)\)/g)) {
      for (const code of m[2].split(",")) stated.set(code, Number(m[1]) / 100);
    }
    for (const p of PROVINCES) {
      if (p === "quebec") continue;
      const code = PROVINCE_ISO_CODES[p];
      const rate = stated.get(code) ?? (CRA[p].label === "GST" ? stated.get("territories") : undefined);
      expect({ p, rate }).toEqual({ p, rate: CRA[p].rate });
    }
  });

  it("the receipt check's ceiling is the highest HST rate", () => {
    expect(MAX_SALES_TAX_RATE).toBe(Math.max(...PROVINCES.filter((p) => CRA[p].label === "HST").map((p) => CRA[p].rate)));
  });
});
