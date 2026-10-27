/**
 * Migration 00183 (CASL consent ledger) agrees with the code that reads and
 * writes it: the CHECK lists are core's CONSENT_CHANNELS / CONSENT_BASES /
 * CONSENT_METHODS, the ledger has no DELETE policy (a record is evidence),
 * and the newest fn_merge_clients / fn_delete_clients carry the text
 * opt-out. The behaviour itself is checked in CI on a fresh database
 * (scripts/db/behavior-checks.sql).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONSENT_BASES, CONSENT_CHANNELS, CONSENT_METHODS } from "@agent-runway/core/engines/casl-consent-engine";

const DIR = path.resolve(__dirname, "../../../supabase/migrations");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const sql = readFileSync(path.join(DIR, "00183_casl_consent_ledger.sql"), "utf8");

/** The quoted values in `<column> IN (...)` inside a named CHECK. */
function checkList(constraint: string, column: string): string[] {
  const at = sql.indexOf(constraint);
  expect(at, constraint).toBeGreaterThan(-1);
  const m = new RegExp(`${column}\\s+IN\\s*\\(([^)]*)\\)`).exec(sql.slice(at));
  expect(m, `${constraint} ${column}`).not.toBeNull();
  return [...(m?.[1] ?? "").matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/** The body of the newest migration that (re)defines `fn`. */
function latestDefinition(fn: string): { file: string; body: string } {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${fn}\\(`, "i");
  for (const f of [...FILES].reverse()) {
    const text = readFileSync(path.join(DIR, f), "utf8");
    const at = text.search(re);
    if (at >= 0) return { file: f, body: text.slice(at, text.indexOf("$$;", at)) };
  }
  throw new Error(`${fn} not found`);
}

describe("00183 CHECK lists match packages/core", () => {
  it("channel, basis and both method lists", () => {
    expect(checkList("client_email_consents_channel_check", "channel")).toEqual([...CONSENT_CHANNELS]);
    expect(checkList("client_email_consents_basis_check", "basis")).toEqual([...CONSENT_BASES]);
    expect(checkList("client_email_consents_method_check", "method")).toEqual([...CONSENT_METHODS]);
    expect(checkList("client_email_consents_withdrawn_method_check", "withdrawn_method")).toEqual([...CONSENT_METHODS]);
  });
});

describe("00183 keeps the ledger as evidence", () => {
  it("adds insert and update policies, and no delete policy", () => {
    expect(sql).toMatch(/CREATE POLICY "Users record own consents" ON public\.client_email_consents\s+FOR INSERT/);
    expect(sql).toMatch(/CREATE POLICY "Users withdraw own consents" ON public\.client_email_consents\s+FOR UPDATE/);
    expect(sql).not.toMatch(/ON public\.client_email_consents\s+FOR (DELETE|ALL)/);
  });

  it("lets a record change client only inside a merge, and only within the account", () => {
    // Needs both the merge's role and its transaction-local setting.
    const guard = sql.slice(sql.indexOf("IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN"));
    expect(guard.slice(0, 600)).toMatch(/IF current_user <> 'postgres'\s+OR coalesce\(current_setting\('agent_runway\.merging_clients', true\), ''\) <> 'on' THEN/);
    expect(sql).toMatch(/c\.id = NEW\.client_id AND c\.user_id = NEW\.user_id/);
    // Both write policies check the client is the caller's.
    const update = sql.slice(sql.indexOf('CREATE POLICY "Users withdraw own consents"'));
    expect(update.slice(0, 300)).toMatch(/c\.id = client_id AND c\.user_id = auth\.uid\(\)/);
  });

  it("guards every update with a trigger and grants the Data API explicitly", () => {
    expect(sql).toMatch(/BEFORE UPDATE ON public\.client_email_consents/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.client_email_consents TO authenticated, service_role;/);
  });

  it("adds columns only (no drops, renames or type changes)", () => {
    expect(sql).not.toMatch(/\bDROP\s+(COLUMN|TABLE)\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN/i);
  });
});

describe("the newest client merge and delete carry the text opt-out", () => {
  it("the newest fn_merge_clients (00183, or a later one that keeps all of it) keeps the LATEST opt-out per channel", () => {
    const { file, body } = latestDefinition("fn_merge_clients");
    expect(file >= "00183_casl_consent_ledger.sql").toBe(true);
    expect(body).toMatch(/ORDER BY c\.email_opt_out_at DESC/);
    expect(body).toMatch(/ORDER BY c\.sms_opt_out_at DESC/);
    expect(body).toMatch(/email_opt_out_at\s+= v_email_at/);
    expect(body).toMatch(/sms_opt_out_at\s+= v_sms_at/);
  });

  it("fn_merge_clients keeps an agent-recorded opt-out the agent's, with its method and note", () => {
    const { body } = latestDefinition("fn_merge_clients");
    for (const ch of ["email", "sms"]) {
      expect(body).toMatch(new RegExp(`c\\.${ch}_opt_out_source = 'agent'`));
      expect(body).toMatch(new RegExp(`v_${ch}_src := 'agent';\\s+v_${ch}_method := v_agent_method;\\s+v_${ch}_note := v_agent_note;`));
    }
  });

  it("fn_merge_clients turns the merging setting on only around its FK loop", () => {
    const { body } = latestDefinition("fn_merge_clients");
    const on = body.indexOf("set_config('agent_runway.merging_clients', 'on', true)");
    const loop = body.indexOf("FOR v_fk IN");
    const off = body.indexOf("set_config('agent_runway.merging_clients', '', true)");
    expect(on).toBeGreaterThan(-1);
    expect(on).toBeLessThan(loop);
    expect(off).toBeGreaterThan(loop);
  });

  it("fn_delete_clients is 00183's and archives a client with a text opt-out", () => {
    const { file, body } = latestDefinition("fn_delete_clients");
    expect(file).toBe("00183_casl_consent_ledger.sql");
    expect(body).toMatch(/c\.sms_opt_out_at IS NOT NULL/);
    expect(body).toMatch(/client_email_consents x WHERE x\.client_id = c\.id/);
  });
});
