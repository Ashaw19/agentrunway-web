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

  // 2026-11-04: the AI knowledge audit returned "no_data" before its beat on
  // every quiet day, so the first routine check called it "never reported".
  // Every exit from a cron route except the 401 must be preceded by a beat.
  it("every return after the auth check follows a heartbeat", () => {
    const vercel = JSON.parse(readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"));
    for (const c of vercel.crons as { path: string }[]) {
      const lines = readFileSync(path.resolve(__dirname, "../../app", c.path.slice(1), "route.ts"), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/^\s*return (NextResponse\.json|new Response)\(/.test(line)) return;
        if (/Unauthorized/.test(line)) return;
        const before = lines.slice(Math.max(0, i - 4), i).join("\n");
        expect(before, `${c.path}:${i + 1} returns without a heartbeat`).toMatch(/writeHeartbeat\(/);
      });
    }
  });
});
