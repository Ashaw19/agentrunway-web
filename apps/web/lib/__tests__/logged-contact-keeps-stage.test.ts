/**
 * Logging contact never changes a client's stage (migration 00189,
 * 2026-10-27).
 *
 * Since 00105 the contact_activities trigger moved a Cruising or Scheduled
 * client to Boarding whenever a call, text, email, meeting or showing was
 * logged. Andrew's 12 past-client check-in texts (2026-10-06/07) turned 12
 * past clients into Boarding leads, and 14 days later the phone showed them
 * as 12 Overdue. The app asks for those check-ins, so logging one must keep
 * a past client Cruising. Stage changes are the agent's.
 *
 *   - The newest definition of update_client_last_contact() writes no status.
 *   - No screen, toast or AI reply says a client was moved by logging contact.
 *   - The help text the AI reads doesn't say it either.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRIGGER_SIDE_EFFECTS } from "@agent-runway/core/lib/ai-activity";

const WEB = path.resolve(__dirname, "..", "..");
const ROOT = path.resolve(WEB, "..", "..");
const MIGRATIONS = path.join(WEB, "supabase", "migrations");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** The body of the last migration that (re)defines the function. */
function latestDefinition(fn: string): { file: string; body: string } {
  const pattern = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "i");
  let latest: { file: string; body: string } | null = null;
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const m = readFileSync(path.join(MIGRATIONS, file), "utf8").match(pattern);
    if (m) latest = { file, body: m[1].replace(/--.*$/gm, "") };
  }
  if (!latest) throw new Error(`no migration defines ${fn}`);
  return latest;
}

describe("the contact_activities trigger", () => {
  it("keeps last contact in step and never writes a client's status", () => {
    const { file, body } = latestDefinition("update_client_last_contact");
    expect(file >= "00189").toBe(true);
    expect(body).toMatch(/set\s+last_contact_at\s*=\s*new\.activity_date/i);
    expect(body).toMatch(/new\.type\s*=\s*'note'/i); // a note still isn't contact (00171)
    expect(body).not.toMatch(/\bstatus\b/i);
    expect(body).not.toMatch(/boarding/i);
  });
});

describe("nothing says logging contact moved a client", () => {
  const FILES = [
    "apps/mobile/stores/data-store.ts",
    "apps/web/app/(app)/crm/clients-content.tsx",
    "apps/web/app/(app)/flight-control/flight-control-content.tsx",
    "apps/web/components/checklist/complete-item-dialog.tsx",
    "apps/web/app/api/mobile/log-activity/route.ts",
    "apps/web/lib/ai/tools.ts",
    "packages/core/lib/log-client-contact.ts",
    "packages/core/lib/record-writers.ts",
    "packages/core/lib/checklist-actions.ts",
  ];

  it.each(FILES)("%s", (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/auto-promoted/i);
    expect(src).not.toMatch(/because you were in touch|because a real touchpoint was logged/i);
    expect(src).not.toMatch(/\bpriorStatus\b|\bnewStatus\b.*priorStatus/);
  });

  it("the AI's help text and undo note", () => {
    for (const rel of ["apps/web/lib/knowledge-base.ts", "apps/web/lib/troubleshooting-playbooks.ts"]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/may move Cruising\/Scheduled to Boarding/);
      expect(src, rel).not.toMatch(/(?:automatically promoted|moves them|moved) to Boarding/);
      expect(src, rel).not.toMatch(/a Cruising or Scheduled client moved to Boarding/);
    }
    for (const effect of TRIGGER_SIDE_EFFECTS.contact_activities ?? []) {
      expect(effect.reinsertNote ?? "").not.toMatch(/boarding/i);
    }
  });
});
