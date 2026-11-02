/**
 * Every Vercel cron route in vercel.json is in ROUTINE_REGISTRY, so a new
 * cron job can't be added without the daily routine check watching it
 * (routine-heartbeats, 00191). The checker itself writes a beat but is not
 * in its own list.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTINE_REGISTRY } from "@agent-runway/core/engines/routine-heartbeats";

describe("routine registry covers vercel.json", () => {
  it("names every cron route", () => {
    const vercel = JSON.parse(readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"));
    const routes = (vercel.crons as { path: string }[]).map((c) => `cron:${c.path.replace("/api/cron/", "")}`);
    expect(routes).toContain("cron:routine-check");
    const ids = new Set(ROUTINE_REGISTRY.map((r) => r.id));
    for (const id of routes) {
      if (id === "cron:routine-check") continue;
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("every cron route writes a heartbeat", () => {
    const vercel = JSON.parse(readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"));
    for (const c of vercel.crons as { path: string }[]) {
      const src = readFileSync(path.resolve(__dirname, "../../app", c.path.slice(1), "route.ts"), "utf8");
      expect(src, c.path).toMatch(/writeHeartbeat\(/);
    }
  });
});
