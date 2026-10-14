/**
 * The dashboard's Closing Day prompt and Transactions → Pipeline → Close
 * record a deal the same way, and a recorded deal is not asked about again
 * (2026-10-14).
 *
 * What was wrong:
 *   - Transactions → Pipeline → Close wrote a transaction with
 *     pipeline_deal_id and kept the pipeline row at stage='closed'.
 *   - The dashboard listed every row at 'firm' OR 'closed' dated today or
 *     earlier, so that deal asked "What's the status?" every day.
 *   - The prompt's Register & Close inserted a second transaction (no
 *     pipeline_deal_id, no validation) and deleted the pipeline row, which
 *     nulled the first transaction's link and dropped the deal from forecast
 *     accuracy.
 *
 * Now: `dealsAwaitingCloseConfirmation` (core/types/database.ts, its own
 * suite in core/engines/__tests__/closing-day-prompt-deals.test.ts) picks the
 * rows, from the ids the dashboard page reads off `transactions`, and both
 * screens write through `recordPipelineDealClose`. This file holds the
 * screens, the page and the AI knowledge to that.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import { getPlaybook } from "@/lib/troubleshooting-playbooks";
import { classifyTopicMulti } from "@/lib/troubleshooting-classifier";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../.."); // apps/web/
const source = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

/** The body of `async function name(...) { ... }` up to the next top-level handler. */
function handler(src: string, name: string): string {
  const start = src.indexOf(`async function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = src.indexOf("\n  async function ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("which deals the Closing Day prompt asks about", () => {
  const dash = source("app/(app)/dashboard/dashboard-content.tsx");
  const page = source("app/(app)/dashboard/page.tsx");

  it("the dashboard picks them with the canonical filter, never its own stage check", () => {
    expect(dash).toMatch(/dealsAwaitingCloseConfirmation\(pipelineDeals, new Set\(recordedPipelineDealIds\), today\)/);
    expect(dash).not.toMatch(/d\.stage !== "firm" && d\.stage !== "closed"/);
  });

  it("asks about nothing when it could not tell which deals are recorded", () => {
    const memo = dash.slice(dash.indexOf("const dealsClosingToday = useMemo("), dash.indexOf("}, [pipelineDeals, recordedPipelineDealIds]);"));
    expect(memo).toContain("if (!recordedPipelineDealIds) return [];");
  });

  it("the page reads which pipeline rows a transaction already carries, in any year", () => {
    const read = page.slice(page.indexOf('.select("pipeline_deal_id")') - 80, page.indexOf('.select("pipeline_deal_id")') + 200);
    expect(read).toContain('.from("transactions")');
    expect(read).toContain('.not("pipeline_deal_id", "is", null)');
    expect(read).not.toContain('.gte("date"');
    expect(read).not.toContain('.eq("status"');
    expect(page).toContain("recordedPipelineDealIds={recordedPipelineDealIds}");
  });
});

describe("what closing does to the pipeline row", () => {
  const prompt = source("app/(app)/dashboard/closing-day-prompt.tsx");
  const tab = source("app/(app)/transactions/transactions-pipeline-tab.tsx");
  const register = handler(prompt, "handleRegisterClose");
  const close = handler(tab, "handleClose");

  it.each([
    ["dashboard prompt", register],
    ["Transactions → Pipeline", close],
  ])("%s records the deal through the shared writer", (_, body) => {
    expect(body).toMatch(/recordPipelineDealClose\(supabase, \{/);
    expect(body).not.toMatch(/from\("transactions"\)\s*\.insert\(/);
    expect(body).not.toMatch(/from\("pipeline_deals"\)\s*\.(delete|update)\(/);
  });

  it("the prompt no longer deletes the pipeline row anywhere", () => {
    expect(prompt).not.toMatch(/from\("pipeline_deals"\)\s*\.delete\(/);
  });

  it("the prompt validates the numbers the way the Transactions tab does", () => {
    expect(register).toMatch(/validateTransaction\(\{\s*sale_price: confirmForm\.sale_price,\s*commission_pct: confirmForm\.commission_pct,\s*\}\)/);
    expect(close).toMatch(/validateTransaction\(\{\s*sale_price: closeForm\.sale_price,\s*commission_pct: closeForm\.commission_pct,\s*\}\)/);
    expect(register).not.toMatch(/parseFloat\(confirmForm\.(sale_price|commission_pct)\)/);
  });

  it("the writer links the transaction, keeps the row at closed, and never deletes it", () => {
    const writer = source("lib/record-pipeline-deal-close.ts");
    expect(writer).toContain("pipeline_deal_id: deal.id,");
    expect(writer).toContain('stage: "closed",');
    expect(writer).toContain("original_estimated_price: deal.original_estimated_price ?? deal.estimated_price,");
    expect(writer).not.toMatch(/from\("pipeline_deals"\)\s*\.delete\(/);
    // A failed stage update undoes the transaction it just wrote.
    expect(writer).toMatch(/if \(closeErr\) \{\s*await supabase\.from\("transactions"\)\.delete\(\)\.eq\("id", tx\.id\)/);
  });
});

describe("the AI knowledge", () => {
  const pipeline = getPlaybook("pipeline");

  it("the pipeline playbook says which deals the prompt lists and that both screens close the same way", () => {
    expect(pipeline).toContain("### Closing Day Prompt (dashboard)");
    expect(pipeline).toContain("no transaction linked to the row");
    expect(pipeline).toContain("Two places record it, and both do exactly the same thing");
    expect(pipeline).toContain("The Closing Day prompt keeps asking about a deal I already closed");
    expect(pipeline).not.toContain('"Convert to Closed"');
  });

  it("the knowledge base says a recorded deal is never asked about again", () => {
    expect(KNOWLEDGE_BASE).toContain("a recorded deal is never asked about again");
    expect(KNOWLEDGE_BASE).toContain("Changed 2026-10-14");
  });

  it("a question about the prompt loads the pipeline playbook too", () => {
    const topics = classifyTopicMulti("The closing day prompt keeps asking about a deal I already closed").map((t) => t.topic);
    expect(topics.slice(0, 2)).toEqual(expect.arrayContaining(["transactions", "pipeline"]));
  });
});
