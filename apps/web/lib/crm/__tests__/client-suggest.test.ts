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
    expect(suggestionTerms('ka%th,"(')).toEqual(["ka", "th"]);
    expect(suggestionTerms("O\u2019Brien")).toEqual(["o'brien"]);
  });

  it("splits at hyphens and periods, so Jean-Luc and J.P. find their clients", () => {
    expect(suggestionTerms("Jean-Luc")).toEqual(["jean", "luc"]);
    expect(suggestionTerms("J.P. Roy")).toEqual(["j", "p", "roy"]);
  });

  it("keeps the combining marks some alphabets need", () => {
    expect(suggestionTerms("\u092a\u094d\u0930\u093f\u092f\u093e")).toEqual(["\u092a\u094d\u0930\u093f\u092f\u093e"]);
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

  it("finds a hyphenated or dotted name typed the same way", () => {
    expect(rankClientSuggestions("Jean-Luc", [row("Jean-Luc Roy")])).toHaveLength(1);
    expect(rankClientSuggestions("J.P.", [row("J.P. Roy")])).toHaveLength(1);
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
    expect(exactClientMatch(" kathy  STEFANIDES", [row("Kathy Stefanides")])?.id).toBe("id-Kathy Stefanides");
  });

  it("waits while the text ends in a space, so Mike can become Mike Brown", () => {
    const rows = [row("Mike"), row("Mike Brown")];
    expect(exactClientMatch("Mike ", rows)).toBeNull();
    expect(exactClientMatch("Mike", rows)?.name).toBe("Mike");
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
    expect(calls.or[0][0]).toContain('name_search.ilike."%.kathy%"');
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

  it("leaves Escape to an open client list instead of closing the dialog", () => {
    expect(code).toContain("onEscapeKeyDown={keepEscapeForClientList}");
  });

  it("stores the picked name on a buyer prospect", () => {
    expect(code).toMatch(/client_name:\s*bp\.client\.name\.trim\(\)/);
  });
});

describe("keepEscapeForClientList and the box", () => {
  const field = readFileSync(path.resolve(__dirname, "../../../components/client-name-field.tsx"), "utf8");

  it("never lets Tab pick a client, and Enter only from a list found for this text", () => {
    expect(field).not.toMatch(/"Tab"/);
    expect(field).toContain("listFor === typed && suggestions[active]");
  });

  it("starts with nothing highlighted where free text is allowed", () => {
    expect(field).toContain("freeTextHint ? -1 : 0");
  });
});
