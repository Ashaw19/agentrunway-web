import { describe, it, expect } from "vitest";
import { recentlyContactedClientIds } from "../recently-contacted";

/**
 * Flight Control's 14-day suppression.
 *
 * "Mark as sent" writes outreach_queue.sent_at but logs no CRM activity, so
 * clients.last_contact_at never moves. Before this helper the scan only read
 * last_contact_at — a client you had just emailed from Flight Control came
 * straight back as the top card, and nobody else could rotate in.
 */

const NOW = new Date(2026, 9, 6, 12); // 2026-10-06 local noon
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("recentlyContactedClientIds", () => {
  it("suppresses a client whose CRM last contact is within 14 days", () => {
    const ids = recentlyContactedClientIds(
      [{ id: "a", last_contact_at: daysAgo(3) }],
      [],
      NOW,
    );
    expect(ids.has("a")).toBe(true);
  });

  it("does not suppress a CRM last contact older than 14 days", () => {
    const ids = recentlyContactedClientIds(
      [{ id: "a", last_contact_at: daysAgo(15) }],
      [],
      NOW,
    );
    expect(ids.has("a")).toBe(false);
  });

  it("suppresses a client emailed from Flight Control within 14 days", () => {
    const ids = recentlyContactedClientIds(
      [{ id: "a", last_contact_at: null }],
      [{ client_id: "a", sent_at: daysAgo(2) }],
      NOW,
    );
    expect(ids.has("a")).toBe(true);
  });

  it("ignores Flight Control sends older than 14 days and malformed rows", () => {
    const ids = recentlyContactedClientIds(
      [],
      [
        { client_id: "a", sent_at: daysAgo(20) },
        { client_id: "b", sent_at: null },
        { client_id: null, sent_at: daysAgo(1) },
      ],
      NOW,
    );
    expect(ids.size).toBe(0);
  });
});
