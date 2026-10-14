/**
 * Rows the database accepts (core/lib/write-rows.ts), used by the phone app's
 * store and offline replay.
 *
 * transactions / pipeline_deals address, client_name, notes and
 * contact_activities.description are NOT NULL with a '' default: an explicit
 * null fails the write. clients.name_search is NOT NULL with no default.
 * Until 2026-10-14 the phone sent nulls and no name_search, so Add Deal,
 * Add Client and quick-log Call/Text never saved (PR #344).
 */
import { describe, expect, it } from "vitest";
import { activityRow, clientRow, pipelineDealRow, transactionRow } from "../write-rows";

describe("write-rows", () => {
  it("a transaction insert carries '' for a blank address, client or notes", () => {
    const row = transactionRow({ address: null, client_name: null, notes: null, sale_price: 1 }, { insert: true });
    expect(row).toMatchObject({ address: "", client_name: "", notes: "", sale_price: 1 });
    // An insert that left a column out still sends it.
    expect(transactionRow({ sale_price: 1 }, { insert: true })).toMatchObject({ address: "", client_name: "", notes: "" });
    // A real value is kept.
    expect(transactionRow({ client_name: "Jane" }, { insert: true })).toMatchObject({ client_name: "Jane" });
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

  it("a client carries name_search from its name (toNameSearch), as web's add and rename", () => {
    expect(clientRow({ name: "  Émile  OʼBrien " })).toMatchObject({ name_search: "emile o'brien" });
    expect(clientRow({ phone: "506" })).toEqual({ phone: "506" });
  });
});
