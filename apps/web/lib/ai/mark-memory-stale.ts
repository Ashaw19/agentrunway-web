/**
 * lib/ai/mark-memory-stale.ts
 *
 * Client-side fire-and-forget helper to mark a client's memory profile as stale.
 * Called after successful CRM writes (activity added, profile updated, etc.).
 *
 * Non-blocking: failures are silently swallowed so the CRM write path is never
 * affected by memory infrastructure issues.
 */

export function markMemoryStaleClient(clientId: string): void {
  if (!clientId) return;
  fetch("/api/ai/client-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "mark-stale", client_id: clientId }),
  }).catch(() => {
    // Fire-and-forget — never block or error the CRM UI
  });
}
