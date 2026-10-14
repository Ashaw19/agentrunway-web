/**
 * The phone app's writes and reads match web's (mobile-vs-web parity check,
 * 2026-10-14). The phone has no test runner, so its rules are held here.
 *
 * What was wrong on the phone:
 *   - Closing a pipeline deal only set stage='closed': no transaction, so GCI
 *     never counted the sale. Web records it through recordPipelineDealClose.
 *   - Add Deal sent client_name: null and notes: null, Add Client sent no
 *     name_search, quick-log Call/Text sent description: null. Those columns
 *     are NOT NULL, so every one of those writes failed and sat in the
 *     offline queue as "will sync when online".
 *   - The AI Morning Briefing card called /api/briefing with a Bearer token;
 *     the route read only the web cookie and answered 401.
 *   - Clients loaded .limit(200), so search missed anyone past 200.
 *   - The Checklist could not be ticked off.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activityRow, clientRow, pipelineDealRow, transactionRow } from "../../../mobile/lib/write-rows";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../.."); // agentrunway-web/
const read = (rel: string) => readFileSync(path.join(REPO, rel), "utf8");

describe("the phone's rows satisfy the NOT NULL columns", () => {
  it("a transaction insert carries '' for a blank address, client or notes", () => {
    const row = transactionRow({ address: null, client_name: null, notes: null, sale_price: 1 }, { insert: true });
    expect(row).toMatchObject({ address: "", client_name: "", notes: "", sale_price: 1 });
    // An insert that left a column out still sends it.
    expect(transactionRow({ sale_price: 1 }, { insert: true })).toMatchObject({ address: "", client_name: "", notes: "" });
  });

  it("an update only blanks the columns it sends", () => {
    expect(transactionRow({ notes: null })).toEqual({ notes: "" });
    expect(pipelineDealRow({ address: null, stage: "offer" })).toEqual({ address: "", stage: "offer" });
    expect(pipelineDealRow({ stage: "offer" })).toEqual({ stage: "offer" });
  });

  it("an activity without a description sends ''", () => {
    expect(activityRow({ client_id: "c", type: "call", description: null })).toMatchObject({ description: "" });
    expect(activityRow({ client_id: "c", type: "call" })).toMatchObject({ description: "" });
    expect(activityRow({ client_id: "c", type: "note", description: "Hi" })).toMatchObject({ description: "Hi" });
  });

  it("a client carries name_search from its name, as web's add and rename", () => {
    expect(clientRow({ name: "  Émile  OʼBrien " })).toMatchObject({ name_search: "emile o'brien" });
    expect(clientRow({ phone: "506" })).toEqual({ phone: "506" });
  });

  it("the store and the offline replay both write through these rows", () => {
    const store = read("apps/mobile/stores/data-store.ts");
    const queue = read("apps/mobile/stores/offline-queue.ts");
    expect(store).toMatch(/\.insert\(\{ \.\.\.row, user_id: user\.id \}\)/); // row = transactionRow(...)
    expect(store).toContain("transactionRow({ ...tx }, { insert: true })");
    expect(store).toContain("clientRow({ ...merged, user_id: user.id })");
    expect(store).toContain("activityRow({ ...activity, user_id: user.id })");
    expect(store).toContain("pipelineDealRow({ ...updates })");
    expect(queue).toContain("transactionRow({ ...mutation.payload, user_id: user.id }, { insert: true })");
    expect(queue).toContain("clientRow({ ...mutation.payload, user_id: user.id })");
    expect(queue).toContain("activityRow({ ...mutation.payload, user_id: user.id })");
  });
});

describe("closing a deal on the phone records the sale", () => {
  const store = read("apps/mobile/stores/data-store.ts");
  const deals = read("apps/mobile/app/(app)/deals.tsx");

  it("closes through the shared writer, as both web screens do", () => {
    expect(store).toMatch(/recordPipelineDealClose\(supabase, \{/);
    expect(store).toContain('from "@agent-runway/core/lib/record-pipeline-deal-close"');
  });

  it("never moves a deal to Closed without recording it", () => {
    expect(store).toMatch(/if \(newStage === "closed"\) return false;/);
    expect(deals).toMatch(/nextStage && nextStage !== "closed"/);
  });

  it("holds active deals only, so a closed or lost row leaves the list and the totals", () => {
    expect(store).toMatch(/activePipelineDeals\(\(pipeRes\.data \?\? \[\]\) as PipelineDeal\[\]\)/);
  });

  it("marks a buyer prospect lost through web's RPC", () => {
    expect(store).toMatch(/rpc\("fn_mark_opportunity_lost", \{\s*p_id: dealId,\s*p_source: "buyer_prospect",/);
  });

  it("counts GCI with core computeGCI, never its own formula", () => {
    for (const rel of [
      "apps/mobile/stores/data-store.ts",
      "apps/mobile/app/(app)/deals.tsx",
      "apps/mobile/app/(app)/index.tsx",
      "apps/mobile/app/(app)/search.tsx",
      "apps/mobile/app/(app)/clients.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(/team_split_pct \?\? 1/);
    }
  });

  it("Add Deal takes a date and a client, validated with core validateTransaction", () => {
    expect(deals).toContain("validateTransaction({");
    expect(deals).not.toMatch(/client_name: null/);
    expect(deals).toMatch(/<DateField\s+label=\{t\("addDeal\.closingDateLabel"\)\}/);
    expect(deals).toMatch(/<ClientNameField\s+label=\{t\("addDeal\.clientLabel"\)\}/);
  });
});

describe("the phone loads every client", () => {
  const store = read("apps/mobile/stores/data-store.ts");

  it("pages through clients instead of stopping at 200", () => {
    expect(store).not.toMatch(/\.limit\(200\)/);
    expect(store.match(/fetchAllClientRows\(user\.id\)/g)?.length).toBe(2); // fetchAll + fetchClients
    expect(store).toMatch(/\.range\(from, from \+ CLIENT_PAGE - 1\)/);
  });

  it("a failed read keeps the cached list instead of writing [] over it", () => {
    expect(store).toContain('if (clientRes.error) failed.push("clients");');
    expect(store).not.toMatch(/clients: \(clientRes\.data \?\? \[\]\)/);
  });
});

describe("the phone's AI Morning Briefing card loads", () => {
  it("the card calls /api/briefing with the phone's token", () => {
    const card = read("apps/mobile/app/(app)/profile/briefing.tsx");
    expect(card).toMatch(/fetch\(`\$\{API_URL\}\/api\/briefing`, \{\s*headers: \{ Authorization: `Bearer \$\{session\.access_token\}` \},/);
  });

  it("/api/briefing accepts the Bearer token as well as the web cookie", () => {
    const route = read("apps/web/app/api/briefing/route.ts");
    const auth = read("apps/web/lib/supabase/request-user.ts");
    expect(route).toContain("await getRequestUser(req)");
    expect(route).not.toMatch(/export async function GET\(\)/);
    expect(auth).toMatch(/startsWith\("Bearer "\)/);
    // The phone's client is token-scoped, so RLS still applies.
    expect(auth).toMatch(/global: \{ headers: \{ Authorization: `Bearer \$\{accessToken\}` \} \}/);
  });
});

describe("the phone ticks Checklist items off the way web does", () => {
  const store = read("apps/mobile/stores/data-store.ts");

  it("uses web's writers (core checklist-actions), never a bare completed_at update", () => {
    expect(store).toContain('from "@agent-runway/core/lib/checklist-actions"');
    expect(store).toMatch(/completeWithContact\(supabase, task, method, note\)/);
    expect(store).toMatch(/logAttemptAndReschedule\(supabase, task, method, note\)/);
    expect(store).toMatch(/markItemDone\(supabase, task\.id, "done"\)/);
    expect(store).not.toMatch(/from\("contact_tasks"\)\s*\.update\(/);
  });

  it("a contact logged on a client marks their memory profile outdated, as web does", () => {
    expect(store).toMatch(/void markMemoryStale\(supabase, user\.id, clientId\)/);
    expect(store).toMatch(/void markMemoryStale\(supabase, user\.id, activity\.client_id\)/);
  });
});
