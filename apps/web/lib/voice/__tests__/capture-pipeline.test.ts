/**
 * The capture pipeline on the server (lib/voice/capture.ts), Flight Crew's
 * captureNote tool, and the promise that ties every surface together: each
 * proposed write's args are a valid input for the Flight Crew write tool it
 * names, so chat, MCP, web and phone save through the same writer.
 *
 * The extraction model is mocked at the boundary (no API key locally); its
 * replies are synthetic, as are every client and deal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", async (orig) => ({ ...(await orig<typeof import("ai")>()), generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({
  models: { fast: "test-fast", default: "test-default", fallback: "test-fallback" },
  heliconeHeaders: () => ({}),
}));

import { asSchema, generateText } from "ai";
import { RECEIPT_CATEGORY_KEYS } from "@/lib/types/receipt";
import { pickClient } from "@agent-runway/core/lib/capture/proposals";
import type { ProposedWrite } from "@agent-runway/core/lib/capture/types";
import { CAPTURE_TOOLS } from "@agent-runway/core/lib/capture/types";
import { NEEDS_APPROVAL_TOOLS, createAgentTools, createCoreAgentTools, createPersonaAgentTools } from "@/lib/ai/tools";
import { proposeCapture } from "../capture";
import { buildExtractPrompt } from "../extract-prompt";
import { formatCaptureForChat } from "../capture-chat";
import { fakeSupabase, type Row } from "@/lib/ai/__tests__/helpers/fake-supabase";

const USER = "user-1";
const TODAY = "2026-10-18"; // Sunday

const ID = {
  sarahJ: "00000000-0000-4000-8000-000000000001",
  sarahL: "00000000-0000-4000-8000-000000000002",
  mark: "00000000-0000-4000-8000-000000000003",
  pine: "00000000-0000-4000-8000-0000000000d1",
};

function tables(): Record<string, Row[]> {
  const c = (id: string, name: string, last: string | null): Row => ({
    id, user_id: USER, name, name_search: name.toLowerCase(), status: "boarding", last_contact_at: last, archived_at: null,
  });
  return {
    clients: [
      c(ID.sarahJ, "Sarah Johnson", "2026-10-10T15:00:00Z"),
      c(ID.sarahL, "Sarah Lee", "2026-10-16T15:00:00Z"),
      c(ID.mark, "Mark Doiron", "2026-09-01T15:00:00Z"),
    ],
    pipeline_deals: [
      { id: ID.pine, user_id: USER, address: "40 Pine Ave", client_name: "Sarah Lee", client_id: ID.sarahL, stage: "offer", expected_close_date: "2026-11-30", updated_at: "2026-10-02T00:00:00Z" },
    ],
  };
}

/** What the model returns for the note below (synthetic). */
const SHOWING_NOTE = "Showed 12 Elm to Sarah this afternoon, she loved the kitchen. Follow up Thursday about writing an offer. Mark texted, the Pine Ave deal is now conditional and closes November 20. Drove 18 km. Coffee with Mark at Java Moose, 6.75. Met a new buyer at the open house, Dana Whitfield, 506-555-0143, call her Tuesday.";
const SHOWING_REPLY = {
  transcript_cleaned: SHOWING_NOTE,
  intents: [
    { intent: "log_activity", client_name: "Sarah", deal: null, activity_type: "showing", summary: "Showed 12 Elm; she loved the kitchen.", date_spoken: "this afternoon", date: TODAY },
    { intent: "create_task", title: "Follow up with Sarah about writing an offer", client_name: "Sarah", due_spoken: "Thursday", due_date: "2026-10-22", priority: "normal", notes: null },
    { intent: "log_activity", client_name: "Mark", deal: null, activity_type: "text", summary: "Mark texted about the Pine Ave deal.", date_spoken: null, date: null },
    { intent: "update_deal", deal: "Pine Ave", client_name: null, stage: "conditional", close_date_spoken: "November 20", close_date: "2026-11-20" },
    { intent: "log_trip", km: 18, from: null, to: "12 Elm St", purpose: "Showing at 12 Elm St", date_spoken: null, date: null },
    { intent: "new_expense", category_key: "meals_client", amount: 6.75, tax_amount: null, vendor: "Java Moose", description: "Coffee with Mark", date_spoken: null, date: null },
    { intent: "new_client", full_name: "Dana Whitfield", email: null, phone: "506-555-0143", city: null, side: "buyer", lead_source: "open_house", notes: null },
    { intent: "create_task", title: "Call Dana", client_name: "Dana", due_spoken: "Tuesday", due_date: "2026-10-20", priority: "normal", notes: null },
  ],
};

function modelReplies(reply: unknown) {
  vi.mocked(generateText).mockResolvedValue({ text: typeof reply === "string" ? reply : JSON.stringify(reply) } as never);
}

beforeEach(() => vi.mocked(generateText).mockReset());

async function showingProposal() {
  modelReplies(SHOWING_REPLY);
  const { client } = fakeSupabase(tables());
  return proposeCapture(client, USER, SHOWING_NOTE, { today: TODAY });
}

describe("proposeCapture", () => {
  it("turns one note after a showing into the writes it holds", async () => {
    const p = await showingProposal();
    expect(p.today).toBe(TODAY);
    expect(p.writes.map((w) => w.tool)).toEqual([
      "createClient",
      "logContactActivity", "createContactTask", "logContactActivity",
      "updatePipelineDealStage", "updatePipelineDealCloseDate",
      "logMileage", "logExpense", "createContactTask",
    ]);
  });

  it("asks which Sarah; picks the one Mark and the one Pine Ave deal", async () => {
    const p = await showingProposal();
    const [sarahActivity, sarahTask, markActivity, stage] = p.writes.slice(1);
    expect(sarahActivity.client?.selectedId).toBeNull();
    expect(sarahActivity.client?.candidates.map((c) => c.id)).toEqual([ID.sarahL, ID.sarahJ]);
    expect(sarahTask.client?.selectedId).toBeNull();
    expect(markActivity.args).toMatchObject({ clientId: ID.mark, type: "text" });
    expect(stage.args).toEqual({ dealId: ID.pine, dealDescription: "40 Pine Ave — Sarah Lee", stage: "conditional" });
  });

  it("resolves the follow-up on Thursday and the new client's Tuesday call in Atlantic days", async () => {
    const p = await showingProposal();
    expect(p.writes[2].args).toMatchObject({ dueDate: "2026-10-22" });
    expect(p.writes[8].args).toMatchObject({ dueDate: "2026-10-20", clientName: "Dana Whitfield" });
    expect(p.writes[8].client?.newClientWriteId).toBe(p.writes[0].id);
  });

  it("gives the model today's Atlantic day and weekday, and the profile's client", async () => {
    await showingProposal();
    const prompt = String(vi.mocked(generateText).mock.calls[0][0].prompt);
    expect(prompt).toContain("Today is Sunday 2026-10-18 (Atlantic time).");
    const withContext = buildExtractPrompt({ transcript: "x", today: TODAY, weekday: "Sunday", contextClientName: "Mark Doiron" });
    expect(withContext).toContain("recorded this from Mark Doiron's profile");
  });

  it("the prompt offers every expense item key, and no retired ones", () => {
    const prompt = buildExtractPrompt({ transcript: "x", today: TODAY, weekday: "Sunday" });
    for (const key of RECEIPT_CATEGORY_KEYS) expect(prompt, key).toContain(key);
    for (const retired of ["travel_meals", "professional_fees", "office_tech"]) expect(prompt).not.toContain(retired);
  });

  it("a reply that isn't JSON throws, so the route answers 422", async () => {
    modelReplies("I'm not able to help.");
    const { client } = fakeSupabase(tables());
    await expect(proposeCapture(client, USER, "x", { today: TODAY })).rejects.toThrow(/JSON/);
  });
});

describe("proposed args are the Flight Crew tools' inputs", () => {
  it("every write's args validate against its tool's input schema", async () => {
    let p = await showingProposal();
    // The agent picks Sarah Lee on the card; the task gets her too.
    const lee = p.writes[1].client!.candidates.find((c) => c.id === ID.sarahL)!;
    p = { ...p, writes: pickClient(p.writes, p.writes[1].id, { kind: "existing", candidate: lee }) };
    const { client } = fakeSupabase(tables());
    const tools = createAgentTools(client, USER);
    for (const w of p.writes) {
      const args = w.tool === "createContactTask" && w.client?.newClientWriteId
        ? { ...w.args, clientId: "00000000-0000-4000-8000-0000000000aa" }
        : w.args;
      const result = await asSchema(tools[w.tool].inputSchema).validate!(args);
      expect(result.success, `${w.tool} ${JSON.stringify(args)}`).toBe(true);
    }
  });

  it("every capture tool is a Flight Crew write tool behind the approval card", () => {
    const { client } = fakeSupabase({});
    const tools = createAgentTools(client, USER);
    for (const tool of CAPTURE_TOOLS) {
      expect(tools[tool], tool).toBeDefined();
      expect(NEEDS_APPROVAL_TOOLS.has(tool), tool).toBe(true);
    }
  });
});

describe("captureNote (Flight Crew)", () => {
  it("returns the proposal for approval and saves nothing", async () => {
    modelReplies(SHOWING_REPLY);
    const { client, writes } = fakeSupabase(tables());
    const tools = createAgentTools(client, USER);
    const out = String(await (tools.captureNote.execute as (a: unknown, o: unknown) => Promise<unknown>)(
      { transcript: SHOWING_NOTE }, { toolCallId: "t", messages: [] },
    ));
    expect(writes).toEqual([]);
    expect(out).toContain("NOTHING IS SAVED YET");
    expect(out).toMatch(/2\. logContactActivity \(Dispatcher\): NEEDS A PICK\. "Sarah" could be: Sarah Lee \(clientId 0+-0000-4000-8000-000000000002/);
    expect(out).toContain("Never pick the first");
    expect(out).toMatch(/7\. logMileage \(Navigator\): ready\./);
    expect(out).toContain(`"dealId":"${ID.pine}"`);
    expect(out).toMatch(/9\. createContactTask \(Dispatcher\): about the NEW client in item 1/);
    expect(NEEDS_APPROVAL_TOOLS.has("captureNote")).toBe(false);
  });

  it("says so when the model's reply can't be read", async () => {
    modelReplies("nope");
    const { client } = fakeSupabase(tables());
    const out = await (createAgentTools(client, USER).captureNote.execute as (a: unknown, o: unknown) => Promise<unknown>)(
      { transcript: "x" }, { toolCallId: "t", messages: [] },
    );
    expect(out).toMatch(/Couldn't read that note/);
  });

  it("is on Dispatcher and Navigator (each saves its own lane), not Captain", () => {
    const { client } = fakeSupabase({});
    expect(createPersonaAgentTools(client, USER, "dispatcher").captureNote).toBeDefined();
    expect(createPersonaAgentTools(client, USER, "navigator").captureNote).toBeDefined();
    expect(createPersonaAgentTools(client, USER, "captain").captureNote).toBeUndefined();
    expect(createCoreAgentTools(client, USER).captureNote).toBeDefined();
    // A captured close date can be saved, behind the approval card.
    expect(createPersonaAgentTools(client, USER, "dispatcher").updatePipelineDealCloseDate).toBeDefined();
    expect(NEEDS_APPROVAL_TOOLS.has("updatePipelineDealCloseDate")).toBe(true);
  });
});

describe("formatCaptureForChat", () => {
  it("marks a write the card switched off, and lists what wasn't proposed", () => {
    const off: ProposedWrite = {
      id: "w1", tool: "createClient", intent: "new_client", include: false,
      warnings: ["A client named Mark Doiron is already on file."], args: { name: "Mark Doiron" },
    };
    const text = formatCaptureForChat({ transcript: "t", transcriptCleaned: "t", today: TODAY, writes: [off], notes: ["A deal heard as closed wasn't moved."] });
    expect(text).toContain("1. createClient (Dispatcher): proposed OFF.");
    expect(text).toContain("Not proposed: A deal heard as closed wasn't moved.");
  });

  it("an empty note says nothing was found", () => {
    const text = formatCaptureForChat({ transcript: "t", transcriptCleaned: "t", today: TODAY, writes: [], notes: [] });
    expect(text).toContain("No client activity");
  });
});
