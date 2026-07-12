/**
 * Tests for readImportError / categorizeClientError — the client-side helper that
 * turns a failed /api/import-history Response into a user-facing message + a
 * sanitized telemetry bucket.
 *
 * The bug this guards against: a platform 504 (Vercel maxDuration exceeded) or
 * 502 returns a NON-JSON body, so the old `res.json().catch(() => ({}))` collapsed
 * to the generic "Extraction failed" — masking the timeout for a week. These tests
 * pin the status-branching so that never regresses.
 */
import { describe, expect, it } from "vitest";
import {
  readImportError,
  categorizeClientError,
  ImportRequestError,
} from "../client-error";

/** Build a Response with a NON-JSON body (what a platform 504/502 actually returns). */
function nonJson(status: number, body = "<html>Gateway Timeout</html>"): Response {
  return new Response(body, { status });
}

/** Build a Response with a JSON { error } body (what the route returns for its own errors). */
function jsonErr(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("readImportError — non-JSON platform failures", () => {
  it("maps 504 to a split-by-year message and timeout bucket", async () => {
    const info = await readImportError(nonJson(504));
    expect(info.status).toBe(504);
    expect(info.category).toBe("timeout");
    expect(info.message.toLowerCase()).toContain("split");
    expect(info.message.toLowerCase()).toContain("year");
  });

  it("treats 408 request-timeout the same as 504", async () => {
    const info = await readImportError(nonJson(408));
    expect(info.category).toBe("timeout");
  });

  it("maps a non-JSON 502 to server_error and includes the status in the message", async () => {
    const info = await readImportError(nonJson(502));
    expect(info.status).toBe(502);
    expect(info.category).toBe("server_error");
    expect(info.message).toContain("502");
  });
});

describe("readImportError — JSON error bodies from the route", () => {
  it("prefers the server's message on a 500 with a JSON body", async () => {
    const info = await readImportError(jsonErr(500, "Database is unavailable"));
    expect(info.status).toBe(500);
    expect(info.category).toBe("server_error");
    expect(info.message).toBe("Database is unavailable");
  });

  it("buckets 429 as rate_limit and surfaces the server message", async () => {
    const info = await readImportError(jsonErr(429, "The AI service is busy."));
    expect(info.category).toBe("rate_limit");
    expect(info.message).toBe("The AI service is busy.");
  });

  it("uses a default busy message for a non-JSON 429", async () => {
    const info = await readImportError(nonJson(429));
    expect(info.category).toBe("rate_limit");
    expect(info.message.toLowerCase()).toContain("busy");
  });

  it("passes a 422 route message through as extraction_failed", async () => {
    const info = await readImportError(
      jsonErr(422, "No transaction data found in this document. Please check the file and try again."),
    );
    expect(info.status).toBe(422);
    expect(info.category).toBe("extraction_failed");
    expect(info.message).toContain("No transaction data found");
  });

  it("passes a 413 route message through", async () => {
    const info = await readImportError(jsonErr(413, "Document too large. Try uploading fewer pages or a smaller file."));
    expect(info.message).toContain("Document too large");
  });

  it("falls back to a generic message + unknown bucket on a non-JSON 4xx", async () => {
    const info = await readImportError(nonJson(422, "not json"));
    expect(info.category).toBe("unknown");
    expect(info.message.length).toBeGreaterThan(0);
  });
});

describe("categorizeClientError — pre-fetch / thrown errors", () => {
  it("returns the carried category for an ImportRequestError", () => {
    const e = new ImportRequestError({ message: "x", category: "timeout", status: 504 });
    expect(categorizeClientError(e)).toBe("timeout");
  });

  it("buckets a rate-limit message", () => {
    expect(categorizeClientError(new Error("rate limit exceeded (429)"))).toBe("rate_limit");
  });

  it("buckets a network failure", () => {
    expect(categorizeClientError(new Error("fetch failed"))).toBe("network_error");
  });

  it("buckets a context-length overflow", () => {
    expect(categorizeClientError(new Error("maximum context length is 200000 tokens"))).toBe("context_exceeded");
  });

  it("defaults unknown for an unrecognized message", () => {
    expect(categorizeClientError(new Error("something odd happened"))).toBe("unknown");
  });
});
