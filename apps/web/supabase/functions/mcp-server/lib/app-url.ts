/**
 * Where the web app runs, for the MCP tools that call its routes as the
 * caller (capture_note: /api/voice-extract; get_next_up and
 * skip_suggested_client: /api/next-up). Set AGENT_RUNWAY_APP_URL to point at
 * a preview deploy. Read per call, so tests can stub Deno.env without Deno.
 */
export function appUrl(): string {
  return (Deno.env.get("AGENT_RUNWAY_APP_URL") ?? "https://agentrunway.ca").replace(/\/+$/, "");
}
