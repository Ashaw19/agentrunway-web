/**
 * Tests for per-persona reasoning effort mapping (`personaEffort`).
 *
 * Context: Opus 4.8 / Sonnet 4.6 support `output_config.effort`
 * ("low" | "medium" | "high" | "xhigh" | "max") to tune per-request reasoning
 * depth. The chat route applies it per Flight Crew persona — but ONLY on the
 * `default` (Sonnet) and `complex` (Opus) tiers. Haiku (the `fast` tier) and
 * the Groq `fallback` do NOT support effort and 400 if it is sent.
 *
 * These tests pin the persona → effort contract and the tier-gating that keeps
 * effort off Haiku/Groq.
 */

import { describe, expect, it } from "vitest";
import { personaEffort } from "../router";

describe("personaEffort", () => {
  it("maps each persona to its tuned effort on the complex (Opus) tier", () => {
    expect(personaEffort("navigator", "complex")).toBe("high");
    expect(personaEffort("captain", "complex")).toBe("medium");
    expect(personaEffort("dispatcher", "complex")).toBe("low");
  });

  it("maps each persona to its tuned effort on the default (Sonnet) tier", () => {
    expect(personaEffort("navigator", "default")).toBe("high");
    expect(personaEffort("captain", "default")).toBe("medium");
    expect(personaEffort("dispatcher", "default")).toBe("low");
  });

  it("returns undefined on the fast (Haiku) tier for every persona — Haiku 400s on effort", () => {
    expect(personaEffort("navigator", "fast")).toBeUndefined();
    expect(personaEffort("captain", "fast")).toBeUndefined();
    expect(personaEffort("dispatcher", "fast")).toBeUndefined();
  });

  it("returns undefined on the Groq fallback tier for every persona", () => {
    expect(personaEffort("navigator", "fallback")).toBeUndefined();
    expect(personaEffort("captain", "fallback")).toBeUndefined();
    expect(personaEffort("dispatcher", "fallback")).toBeUndefined();
  });

  it("gives Navigator the highest accuracy budget (tax is the wedge)", () => {
    // Navigator must reason at least as hard as the orchestrator and harder
    // than the fast-ops Dispatcher on any tier where effort applies.
    const rank = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4 } as const;
    const nav = personaEffort("navigator", "complex")!;
    const cap = personaEffort("captain", "complex")!;
    const dis = personaEffort("dispatcher", "complex")!;
    expect(rank[nav]).toBeGreaterThan(rank[cap]);
    expect(rank[cap]).toBeGreaterThan(rank[dis]);
  });
});
