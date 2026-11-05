/**
 * The playbooks describe the app as it is (knowledge audit, 2026-11-05).
 *
 * Flight Crew told agents about screens and models that no longer exist: a
 * dashboard "smart alerts" section and a pipeline coverage alert (the
 * detectors in anomaly-engine.ts have no caller outside the engine), voice
 * input as a five-intent router (a confirm card since 2026-10-18), and
 * Flight Control drafts written by Groq Llama (Claude writes them).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPlaybook } from "../troubleshooting-playbooks";

const WEB = path.resolve(__dirname, "..", "..");

function appSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" || name === "node_modules" ? [] : appSources(full);
    }
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("playbooks describe surfaces that exist", () => {
  it("says no screen shows the spending spike or coverage alerts, and no screen does", () => {
    expect(getPlaybook("expenses")).not.toContain("Dashboard smart alerts section");
    expect(getPlaybook("expenses")).toContain("no \"smart alerts\" section");
    expect(getPlaybook("pipeline")).not.toContain("Pipeline Coverage Alert");

    // If a screen starts calling these, the two playbook sections need rewriting.
    const callers = ["app", "components", "lib"]
      .flatMap((d) => appSources(path.join(WEB, d)))
      .filter((f) => !f.endsWith("troubleshooting-playbooks.ts"))
      .filter((f) => /detectExpenseAnomalies|detectPipelineCoverageIssue|detectAllAnomalies/.test(readFileSync(f, "utf8")));
    expect(callers).toEqual([]);
  });

  it("describes voice input as the confirm card, not the old intent router", () => {
    const voice = getPlaybook("voice");
    expect(voice).toContain("confirm card");
    expect(voice).not.toMatch(/Llama|intent/i);
  });

  it("names the model that writes Flight Control drafts", () => {
    expect(getPlaybook("flight-control")).not.toContain("Groq Llama");
  });

  it("places the stale-lead count where the dashboard shows it", () => {
    expect(getPlaybook("crm")).toContain("clients need outreach");
    expect(getPlaybook("crm")).not.toContain("**Dashboard alert**: Active client");
  });
});
