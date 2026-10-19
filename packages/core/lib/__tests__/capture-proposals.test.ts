/**
 * Name resolution and proposed writes (capture/resolve.ts, capture/proposals.ts).
 *
 * The binding rule: when more than one client matches, nothing is picked and
 * the card shows a picker. Nothing defaults to the first match. All names
 * and rows are synthetic.
 */
import { describe, expect, it } from "vitest";
import { parseCaptureExtraction } from "../capture/parse";
import {
  buildCaptureProposal,
  checkWrite,
  loadCaptureLookups,
  pickClient,
  pickDeal,
  resolveCapture,
  type CaptureLookups,
} from "../capture/proposals";
import { nameScore, rankClientCandidates, soleMatch } from "../capture/resolve";
import type { ProposedWrite } from "../capture/types";
import { fakeDb, type Row } from "./helpers/capture-fake-db";

const USER = "user-1";
const TODAY = "2026-10-18"; // a Sunday

function client(id: string, name: string, last_contact_at: string | null = null, extra: Row = {}): Row {
  return {
    id, user_id: USER, name, name_search: name.toLowerCase(), status: "boarding",
    last_contact_at, archived_at: null, ...extra,
  };
}

const CLIENTS: Row[] = [
  client("c-sarah-j", "Sarah Johnson", "2026-10-10T15:00:00Z"),
  client("c-sarah-l", "Sarah Lee", "2026-10-16T15:00:00Z"),
  client("c-sarah-p", "Sarah Pelletier", null),
  client("c-mark", "Mark Doiron", "2026-09-01T15:00:00Z"),
  client("c-old", "Sarah Archived", "2026-10-17T15:00:00Z", { archived_at: "2026-01-01T00:00:00Z" }),
  client("c-other-user", "Sarah Johnson", null, { user_id: "someone-else" }),
];

const DEALS: Row[] = [
  { id: "d-elm", user_id: USER, address: "12 Elm St", client_name: "Mark Doiron", client_id: "c-mark", stage: "showing", expected_close_date: null, updated_at: "2026-10-01T00:00:00Z" },
  { id: "d-pine", user_id: USER, address: "40 Pine Ave", client_name: "Sarah Lee", client_id: "c-sarah-l", stage: "offer", expected_close_date: "2026-11-30", updated_at: "2026-10-02T00:00:00Z" },
  { id: "d-closed", user_id: USER, address: "9 Elm St", client_name: "Mark Doiron", client_id: "c-mark", stage: "closed", expected_close_date: null, updated_at: "2026-10-03T00:00:00Z" },
];

async function propose(intents: unknown[], context = {}) {
  const { db } = fakeDb({ clients: CLIENTS, pipeline_deals: DEALS });
  const parsed = parseCaptureExtraction({ transcript_cleaned: "note", intents });
  return resolveCapture(db, USER, { transcript: "note", parsed, today: TODAY, context });
}

const byTool = (writes: ProposedWrite[], tool: ProposedWrite["tool"]) => writes.filter((w) => w.tool === tool);

describe("client name ranking", () => {
  it("scores exact, every-word and partial matches", () => {
    expect(nameScore("Sarah Johnson", "Sarah Johnson")).toBe(3);
    expect(nameScore("sarah", "Sarah Johnson")).toBe(2);
    expect(nameScore("Johnson Sarah", "Sarah Johnson")).toBe(2);
    expect(nameScore("Jon", "Jonathan Smith")).toBe(1);
    expect(nameScore("René", "Rene Cote")).toBe(2);
    expect(nameScore("Bob", "Sarah Johnson")).toBe(0);
  });

  it("ranks strong matches by most recent contact, and drops weak ones beside them", () => {
    const ranked = rankClientCandidates("Sarah", CLIENTS.filter((c) => c.user_id === USER && !c.archived_at) as never);
    expect(ranked.map((c) => c.id)).toEqual(["c-sarah-l", "c-sarah-j", "c-sarah-p"]);
    expect(soleMatch("Sarah", ranked)).toBeNull();
  });

  it("takes one strong match, or the one exact full name among several", () => {
    const ranked = rankClientCandidates("Sarah Johnson", [
      { id: "a", name: "Sarah Johnson" }, { id: "b", name: "Sarah Johnson-Lee" },
    ]);
    expect(soleMatch("Sarah Johnson", ranked)).toBe("a");
    const twins = rankClientCandidates("Sarah Johnson", [{ id: "a", name: "Sarah Johnson" }, { id: "b", name: "Sarah Johnson" }]);
    expect(soleMatch("Sarah Johnson", twins)).toBeNull();
  });

  it("never takes a weak match on its own", () => {
    const ranked = rankClientCandidates("Jon", [{ id: "a", name: "Jonathan Smith" }]);
    expect(ranked).toHaveLength(1);
    expect(soleMatch("Jon", ranked)).toBeNull();
  });
});

describe("resolveCapture — who a write is about", () => {
  it("several clients named Sarah: a picker, nothing selected", async () => {
    const p = await propose([{ intent: "log_activity", client_name: "Sarah", activity_type: "call", summary: "Talked about offers" }]);
    const [w] = p.writes;
    expect(w.tool).toBe("logContactActivity");
    expect(w.client?.selectedId).toBeNull();
    expect(w.client?.candidates.map((c) => c.id)).toEqual(["c-sarah-l", "c-sarah-j", "c-sarah-p"]);
    // Not another user's client and not an archived one.
    expect(w.client?.candidates.map((c) => c.id)).not.toContain("c-other-user");
    expect(w.client?.candidates.map((c) => c.id)).not.toContain("c-old");
    expect(w.tool === "logContactActivity" && w.args.clientId).toBe("");
    expect(checkWrite(w)).toEqual(["Pick which client."]);
  });

  it("one client fits: selected, ready to save", async () => {
    const p = await propose([{ intent: "log_activity", client_name: "Mark", activity_type: "showing", summary: "Second showing at 12 Elm" }]);
    const [w] = p.writes;
    expect(w.client?.selectedId).toBe("c-mark");
    expect(w.args).toMatchObject({ clientId: "c-mark", clientName: "Mark Doiron", type: "showing", description: "Second showing at 12 Elm" });
    expect(checkWrite(w)).toEqual([]);
  });

  it("a full name said picks that client even with other Sarahs on file", async () => {
    const p = await propose([{ intent: "note", client_name: "Sarah Johnson", summary: "Prefers texts" }]);
    expect(p.writes[0].client?.selectedId).toBe("c-sarah-j");
    expect(p.writes[0].args).toMatchObject({ type: "note" });
  });

  it("recorded on a client's profile: no name said means that client", async () => {
    const p = await propose(
      [{ intent: "log_activity", client_name: null, activity_type: "call", summary: "Left a voicemail" }],
      { clientId: "c-sarah-p" },
    );
    expect(p.writes[0].client).toMatchObject({ selectedId: "c-sarah-p" });
    expect(p.writes[0].client?.candidates[0].match).toBe("context");
  });

  it("recorded on a profile, the first name said is that client, not the other Sarahs", async () => {
    const p = await propose(
      [{ intent: "log_activity", client_name: "Sarah", activity_type: "call", summary: "Booked a showing" }],
      { clientId: "c-sarah-p" },
    );
    expect(p.writes[0].client?.selectedId).toBe("c-sarah-p");
  });

  it("a profile id that isn't the user's own is ignored", async () => {
    const p = await propose(
      [{ intent: "log_activity", client_name: null, activity_type: "call", summary: "x" }],
      { clientId: "c-other-user" },
    );
    expect(p.writes[0].client?.selectedId).toBeNull();
  });

  it("an activity that names only a deal goes on that deal's client", async () => {
    const p = await propose([{ intent: "log_activity", client_name: null, deal: "12 Elm", activity_type: "showing", summary: "Buyers came back" }]);
    expect(p.writes[0].deal?.selectedId).toBe("d-elm");
    expect(p.writes[0].client?.selectedId).toBe("c-mark");
    expect(p.writes[0].client?.candidates[0].match).toBe("deal");
  });

  it("a task with no name is a general to-do; with an unclear name it asks", async () => {
    const p = await propose([
      { intent: "create_task", title: "Order new sign riders", client_name: null, due_spoken: "Friday", priority: "low" },
      { intent: "create_task", title: "Send comps", client_name: "Sarah", due_spoken: "tomorrow" },
    ]);
    const [general, unclear] = p.writes;
    expect(general.args).toEqual({ title: "Order new sign riders", dueDate: "2026-10-23", priority: "low" });
    expect(checkWrite(general)).toEqual([]);
    expect(unclear.args).toMatchObject({ dueDate: "2026-10-19", clientName: "Sarah" });
    expect(unclear.tool === "createContactTask" && unclear.args.clientId).toBeUndefined();
    expect(checkWrite(unclear)).toEqual(["Pick which client, or No client."]);
  });
});

describe("resolveCapture — new clients in the same note", () => {
  it("links the follow-up to the client this note adds", async () => {
    const p = await propose([
      { intent: "new_client", full_name: "Dana Whitfield", phone: "506-555-0143", side: "buyer", lead_source: "open_house" },
      { intent: "create_task", title: "Send Dana the listings", client_name: "Dana", due_spoken: "Tuesday" },
    ]);
    const [create, task] = p.writes;
    expect(create).toMatchObject({ tool: "createClient", include: true, args: { name: "Dana Whitfield", phone: "506-555-0143", side: "buyer", leadSource: "open_house" } });
    expect(task.client?.newClientWriteId).toBe(create.id);
    expect(task.args).toMatchObject({ clientName: "Dana Whitfield", dueDate: "2026-10-20" });
    expect(checkWrite(task)).toEqual([]);
  });

  it("a new client already on file is switched off with a warning", async () => {
    const p = await propose([{ intent: "new_client", full_name: "Mark Doiron" }]);
    expect(p.writes[0]).toMatchObject({ tool: "createClient", include: false });
    expect(p.writes[0].warnings[0]).toMatch(/already on file/);
  });
});

describe("resolveCapture — deals", () => {
  it("moves a stage and a close date on the one matching active deal", async () => {
    const p = await propose([{ intent: "update_deal", deal: "40 Pine", stage: "conditional", close_date_spoken: "November 20" }]);
    const stage = byTool(p.writes, "updatePipelineDealStage")[0];
    const close = byTool(p.writes, "updatePipelineDealCloseDate")[0];
    expect(stage.args).toEqual({ dealId: "d-pine", dealDescription: "40 Pine Ave — Sarah Lee", stage: "conditional" });
    expect(close.args).toEqual({ dealId: "d-pine", dealDescription: "40 Pine Ave — Sarah Lee", closeDate: "2026-11-20" });
  });

  it("a closed deal is not a candidate", async () => {
    const p = await propose([{ intent: "update_deal", deal: "Elm", stage: "offer" }]);
    expect(p.writes[0].deal?.candidates.map((d) => d.id)).toEqual(["d-elm"]);
  });

  it("an unclear close date changes nothing and says so", async () => {
    const p = await propose([{ intent: "update_deal", deal: "40 Pine", close_date_spoken: "after the inspection" }]);
    expect(p.writes).toEqual([]);
    expect(p.notes[0]).toMatch(/wasn't clear/);
  });

  it("a closed deal still in the pipeline isn't recorded twice", async () => {
    const p = await propose([{ intent: "new_transaction", address: "40 Pine Ave", client_name: "Sarah Lee", side: "buyer", sale_price: 450000, commission_pct: 2.5 }]);
    expect(p.writes[0]).toMatchObject({ tool: "recordTransaction", include: false });
    expect(p.writes[0].warnings[0]).toMatch(/Close that deal on the Deals screen/);
  });
});

describe("resolveCapture — dates and money", () => {
  it("resolves past and future words on the Atlantic day given", async () => {
    const p = await propose([
      { intent: "log_activity", client_name: "Mark", activity_type: "showing", summary: "Walked through", date_spoken: "Thursday" },
      { intent: "log_trip", km: 18, to: "12 Elm St", purpose: "Showing at 12 Elm St", date_spoken: "yesterday" },
      { intent: "create_task", title: "Call Mark", client_name: "Mark", due_spoken: "next week" },
    ]);
    expect(p.writes[0].args).toMatchObject({ activityDate: "2026-10-15" });
    expect(p.writes[1].args).toEqual({ tripDate: "2026-10-17", km: 18, description: "Showing at 12 Elm St", toLocation: "12 Elm St" });
    expect(p.writes[2].args).toMatchObject({ dueDate: "2026-10-19" });
  });

  it("an activity today carries no date (it is stamped when saved)", async () => {
    const p = await propose([{ intent: "log_activity", client_name: "Mark", activity_type: "call", summary: "x", date_spoken: "today" }]);
    expect(p.writes[0].tool === "logContactActivity" && p.writes[0].args.activityDate).toBeUndefined();
  });

  it("a missing amount or km is left for the agent, flagged", async () => {
    const p = await propose([
      { intent: "log_trip", km: null, to: "Rothesay", purpose: "Listing appointment" },
      { intent: "new_expense", amount: null, vendor: "Java Moose", category_key: "meals_client" },
    ]);
    expect(p.writes[0].warnings[0]).toBe("Add the kilometres driven.");
    expect(checkWrite(p.writes[0])).toEqual(["Add the kilometres."]);
    expect(checkWrite(p.writes[1])).toEqual(["Add the amount."]);
  });

  it("GST/HST is carried only when said", async () => {
    const p = await propose([
      { intent: "new_expense", amount: 64.4, tax_amount: 8.4, vendor: "Irving", category_key: "vehicle_fuel" },
      { intent: "new_expense", amount: 30, vendor: "Tim Hortons", category_key: "meals_client" },
    ]);
    expect(p.writes[0].args).toMatchObject({ amount: 64.4, taxAmount: 8.4, categoryKey: "vehicle_fuel", expenseDate: TODAY });
    expect("taxAmount" in p.writes[1].args).toBe(false);
  });
});

describe("pickClient / pickDeal", () => {
  it("one pick fills every write that heard the same name", async () => {
    const p = await propose([
      { intent: "log_activity", client_name: "Sarah", activity_type: "call", summary: "Talked about the offer" },
      { intent: "create_task", title: "Send Sarah the paperwork", client_name: "Sarah", due_spoken: "tomorrow" },
      { intent: "log_activity", client_name: "Mark", activity_type: "text", summary: "Confirmed Tuesday" },
    ]);
    const lee = p.writes[0].client!.candidates.find((c) => c.id === "c-sarah-l")!;
    const writes = pickClient(p.writes, p.writes[0].id, { kind: "existing", candidate: lee });
    expect(writes[0].args).toMatchObject({ clientId: "c-sarah-l", clientName: "Sarah Lee" });
    expect(writes[1].args).toMatchObject({ clientId: "c-sarah-l", clientName: "Sarah Lee" });
    expect(writes[2].args).toMatchObject({ clientId: "c-mark" });
    expect(writes.map((w) => checkWrite(w))).toEqual([[], [], []]);
  });

  it("No client makes a task a general to-do", async () => {
    const p = await propose([{ intent: "create_task", title: "Send comps", client_name: "Sarah", due_spoken: "tomorrow" }]);
    const writes = pickClient(p.writes, p.writes[0].id, { kind: "none" });
    expect(writes[0].args).toEqual({ title: "Send comps", dueDate: "2026-10-19", priority: "normal" });
    expect(checkWrite(writes[0])).toEqual([]);
  });

  it("picking a deal fills its id and description", async () => {
    const { db } = fakeDb({ clients: CLIENTS, pipeline_deals: [...DEALS, { ...DEALS[0], id: "d-elm-2", address: "12 Elm Cres", client_name: "Sarah Pelletier", client_id: "c-sarah-p" }] });
    const parsed = parseCaptureExtraction({ intents: [{ intent: "update_deal", deal: "12 Elm", stage: "offer" }] });
    const p = await resolveCapture(db, USER, { transcript: "x", parsed, today: TODAY });
    expect(p.writes[0].deal?.selectedId).toBeNull();
    const cres = p.writes[0].deal!.candidates.find((d) => d.id === "d-elm-2")!;
    const writes = pickDeal(p.writes, p.writes[0].id, cres);
    expect(writes[0].args).toEqual({ dealId: "d-elm-2", dealDescription: "12 Elm Cres — Sarah Pelletier", stage: "offer" });
  });
});

describe("buildCaptureProposal is pure", () => {
  it("builds from lookups without a database", () => {
    const lookups: CaptureLookups = { clients: {}, deals: {}, context: null };
    const parsed = parseCaptureExtraction({ intents: [{ intent: "note", client_name: "Nobody Known", summary: "x" }] });
    const p = buildCaptureProposal({ transcript: "t", parsed, today: TODAY, lookups });
    expect(p.writes[0].client).toMatchObject({ spoken: "Nobody Known", candidates: [], selectedId: null });
    expect(checkWrite(p.writes[0])).toEqual(["Pick the client."]);
  });

  it("loadCaptureLookups searches each name once", async () => {
    const { db } = fakeDb({ clients: CLIENTS, pipeline_deals: DEALS });
    const parsed = parseCaptureExtraction({ intents: [
      { intent: "note", client_name: "Sarah", summary: "a" },
      { intent: "create_task", title: "b", client_name: "sarah" },
    ] });
    const lookups = await loadCaptureLookups(db, USER, parsed);
    expect(Object.keys(lookups.clients)).toEqual(["sarah"]);
  });
});

describe("capped name reads never pick for the agent", () => {
  const joannes = Array.from({ length: 24 }, (_, n) => client(`c-jo-${n}`, `Joanne Tremblay${n}`, `2026-10-${String(10 + (n % 9)).padStart(2, "0")}T15:00:00Z`));
  const anns = [client("c-ann-j", "Ann Jones", "2026-10-01T15:00:00Z"), client("c-ann-s", "Ann Smith", "2026-09-01T15:00:00Z")];

  it("24 Joannes and two Anns: \"Called Ann\" lists both Anns and picks neither", async () => {
    // Insertion order put the Joannes first, as an unordered capped read can.
    const { db } = fakeDb({ clients: [...joannes, ...anns], pipeline_deals: [] });
    const parsed = parseCaptureExtraction({ intents: [{ intent: "log_activity", client_name: "Ann", activity_type: "call", summary: "Called about the listing" }] });
    const p = await resolveCapture(db, USER, { transcript: "Called Ann", parsed, today: TODAY });
    expect(p.writes[0].client?.selectedId).toBeNull();
    expect(p.writes[0].client?.candidates.map((c) => c.id).sort()).toEqual(["c-ann-j", "c-ann-s"]);
  });

  it("one Ann among 24 Joannes is found by the whole-word read and picked", async () => {
    const { db } = fakeDb({ clients: [...joannes, anns[1]], pipeline_deals: [] });
    const parsed = parseCaptureExtraction({ intents: [{ intent: "log_activity", client_name: "Ann", activity_type: "call", summary: "x" }] });
    const p = await resolveCapture(db, USER, { transcript: "x", parsed, today: TODAY });
    expect(p.writes[0].client?.selectedId).toBe("c-ann-s");
  });

  it("when every read for the name comes back at the cap, nothing is picked and the card says more may match", async () => {
    // 30 clients with "Lee" as a word: the whole-word read stops at 25.
    const lees = Array.from({ length: 30 }, (_, n) => client(`c-lee-${n}`, `Pat${n} Lee`, null));
    const { db } = fakeDb({ clients: lees, pipeline_deals: [] });
    const parsed = parseCaptureExtraction({ intents: [{ intent: "note", client_name: "Lee", summary: "x" }] });
    const p = await resolveCapture(db, USER, { transcript: "x", parsed, today: TODAY });
    expect(p.writes[0].client).toMatchObject({ selectedId: null, truncated: true });
  });

  it("a full name is picked when one of its words was read in full, even if the other hit the cap", async () => {
    const sarahs = Array.from({ length: 30 }, (_, n) => client(`c-s-${n}`, `Sarah Lastname${n}`, null));
    const { db } = fakeDb({ clients: [...sarahs, client("c-target", "Sarah Johnson", null)], pipeline_deals: [] });
    const parsed = parseCaptureExtraction({ intents: [{ intent: "note", client_name: "Sarah Johnson", summary: "x" }] });
    const p = await resolveCapture(db, USER, { transcript: "x", parsed, today: TODAY });
    expect(p.writes[0].client?.selectedId).toBe("c-target");
    expect(p.writes[0].client?.truncated).toBeUndefined();
  });

  it("deals: every active deal is read once and ranked, so a capped search can't hide one", async () => {
    const many = Array.from({ length: 40 }, (_, n) => ({ ...DEALS[0], id: `d-${n}`, address: `${n} Elmwood Dr`, client_name: `Buyer ${n}`, client_id: null }));
    const { db, reads } = fakeDb({ clients: CLIENTS, pipeline_deals: [...many, ...DEALS] });
    const parsed = parseCaptureExtraction({ intents: [
      { intent: "update_deal", deal: "12 Elm St", stage: "offer" },
      { intent: "update_deal", deal: "40 Pine", stage: "firm" },
    ] });
    const p = await resolveCapture(db, USER, { transcript: "x", parsed, today: TODAY });
    expect(p.writes.map((w) => w.deal?.selectedId)).toEqual(["d-elm", "d-pine"]);
    expect(reads.filter((r) => r.table === "pipeline_deals")).toHaveLength(1);
  });
});

describe("commission", () => {
  it("0.025 is not taken as 0.025%: the card asks, and a sale price needs a commission", async () => {
    const p = await propose([{ intent: "new_transaction", address: "7 Birch Lane", client_name: "Pat Roy", side: "buyer", sale_price: 450000, commission_pct: 0.025 }]);
    expect(p.writes[0].args).not.toHaveProperty("commissionPct");
    expect(p.writes[0].warnings.join(" ")).toMatch(/heard as 0\.025\. Enter it as a percentage, like 2\.5/);
    expect(checkWrite(p.writes[0])).toEqual(["Add the commission %."]);
    const fixed = { ...p.writes[0], args: { ...p.writes[0].args, commissionPct: 2.5 } } as ProposedWrite;
    expect(checkWrite(fixed)).toEqual([]);
  });
});
