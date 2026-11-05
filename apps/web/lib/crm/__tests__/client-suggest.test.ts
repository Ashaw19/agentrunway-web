import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  exactClientMatch,
  fetchClientSuggestions,
  rankClientSuggestions,
  suggestionTerms,
  type ClientSuggestion,
} from "../client-suggest";

const row = (name: string, last_contact_at: string | null = null): ClientSuggestion => ({
  id: `id-${name}`,
  name,
  last_contact_at,
});

describe("suggestionTerms", () => {
  it("reads each word the way name_search stores it", () => {
    expect(suggestionTerms("  Kathy   Stéf ")).toEqual(["kathy", "stef"]);
  });

  it("keeps a word's apostrophe and drops what could break the filter", () => {
    expect(suggestionTerms("O'Brien")).toEqual(["o'brien"]);
    expect(suggestionTerms('ka%th_y,"(')).toEqual(["kathy"]);
  });

  it("has no terms for blank or punctuation-only text", () => {
    expect(suggestionTerms("   ")).toEqual([]);
    expect(suggestionTerms("%,.")).toEqual([]);
  });
});

describe("rankClientSuggestions", () => {
  it("puts a name that starts with the text ahead of a later word", () => {
    const ranked = rankClientSuggestions("ka", [row("Anna Kane"), row("Kathy Stefanides")]);
    expect(ranked.map((r) => r.name)).toEqual(["Kathy Stefanides", "Anna Kane"]);
  });

  it("then puts the most recently contacted first", () => {
    const ranked = rankClientSuggestions("ka", [
      row("Kate Old", "2025-01-01T12:00:00Z"),
      row("Kathy New", "2026-10-01T12:00:00Z"),
      row("Kay Never"),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Kathy New", "Kate Old", "Kay Never"]);
  });

  it("finds a surname and matches every word typed", () => {
    expect(rankClientSuggestions("stef", [row("Kathy Stefanides")])).toHaveLength(1);
    expect(rankClientSuggestions("kathy st", [row("Kathy Stefanides"), row("Kathy Brown")]).map((r) => r.name))
      .toEqual(["Kathy Stefanides"]);
  });

  it("matches the part of a name after a hyphen, and ignores accents", () => {
    expect(rankClientSuggestions("jon", [row("Anne Smith-Jones")])).toHaveLength(1);
    expect(rankClientSuggestions("rene", [row("René Roy")])).toHaveLength(1);
  });

  it("doesn't match the middle of a word", () => {
    expect(rankClientSuggestions("thy", [row("Kathy Stefanides")])).toEqual([]);
  });

  it("lists six at most", () => {
    const rows = Array.from({ length: 9 }, (_, i) => row(`Kate ${i}`));
    expect(rankClientSuggestions("ka", rows)).toHaveLength(6);
  });
});

describe("exactClientMatch", () => {
  it("links a full name typed without picking from the list", () => {
    expect(exactClientMatch(" kathy  STEFANIDES ", [row("Kathy Stefanides")])?.id).toBe("id-Kathy Stefanides");
  });

  it("never guesses between two clients with the same name, or from part of a name", () => {
    const twins = [{ ...row("Sam Lee"), id: "a" }, { ...row("Sam Lee"), id: "b" }];
    expect(exactClientMatch("Sam Lee", twins)).toBeNull();
    expect(exactClientMatch("Kathy", [row("Kathy Stefanides")])).toBeNull();
  });
});

describe("fetchClientSuggestions", () => {
  function fakeDb(result: { data: unknown; error: unknown }) {
    const calls: Record<string, unknown[][]> = {};
    const q: Record<string, unknown> = {};
    for (const m of ["from", "select", "eq", "is", "or", "order", "limit"]) {
      q[m] = vi.fn((...args: unknown[]) => {
        (calls[m] ??= []).push(args);
        return m === "limit" ? Promise.resolve(result) : q;
      });
    }
    return { db: q as never, calls };
  }

  it("asks only for this agent's active clients, one word-start filter per word", async () => {
    const { db, calls } = fakeDb({ data: [row("Kathy Stefanides")], error: null });
    const rows = await fetchClientSuggestions(db, "user-1", "kathy st");
    expect(rows.map((r) => r.name)).toEqual(["Kathy Stefanides"]);
    expect(calls.from[0]).toEqual(["clients"]);
    expect(calls.eq[0]).toEqual(["user_id", "user-1"]);
    expect(calls.is[0]).toEqual(["archived_at", null]);
    expect(calls.or).toHaveLength(2);
    expect(calls.or[0][0]).toContain('name_search.ilike."kathy%"');
    expect(calls.or[0][0]).toContain('name_search.ilike."% kathy%"');
    expect(calls.or[0][0]).toContain('name_search.ilike."%-kathy%"');
  });

  it("makes no request for blank text", async () => {
    const { db, calls } = fakeDb({ data: [], error: null });
    expect(await fetchClientSuggestions(db, "user-1", "  ")).toEqual([]);
    expect(calls.from).toBeUndefined();
  });

  it("throws on a failed read, so it can't read as no such client", async () => {
    const { db } = fakeDb({ data: null, error: { message: "boom" } });
    await expect(fetchClientSuggestions(db, "user-1", "ka")).rejects.toThrow("boom");
  });
});

describe("the Add Opportunity dialog", () => {
  const code = readFileSync(
    path.resolve(__dirname, "../../../app/(app)/pipeline/components/add-opportunity-dialog.tsx"),
    "utf8",
  );

  it("never asks for an ID", () => {
    expect(code).not.toMatch(/UUID|Client ID/);
  });

  it("uses the name search on all three tabs", () => {
    expect(code.match(/<ClientNameField/g)).toHaveLength(3);
  });

  it("stores the picked name on a buyer prospect", () => {
    expect(code).toMatch(/client_name:\s*bp\.client\.name\.trim\(\)/);
  });
});
