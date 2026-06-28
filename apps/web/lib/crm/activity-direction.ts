/**
 * Pure classification of a logged activity by direction, for the client-detail
 * flight-log rail's §9.1 colour node. No DOM, no React — unit-tested.
 *
 * The activity schema carries no explicit direction field, so direction is
 * derived from the activity TYPE:
 *  - note                  → "note"     a neutral record, not a touch (slate)
 *  - call / email / text   → "outbound" the agent reaching out (blue)
 *  - showing / meeting / offer → "inbound" a two-way engagement moment — the
 *      client is in the room and the signal comes back toward the agent
 *      (emerald — the high-intent touches that move a deal)
 */

import type { ActivityType } from "@/lib/types/database";

export type ActivityDirection = "outbound" | "inbound" | "note";

export function activityDirection(type: ActivityType): ActivityDirection {
  if (type === "note") return "note";
  if (type === "showing" || type === "meeting" || type === "offer") return "inbound";
  return "outbound"; // call, email, text
}
