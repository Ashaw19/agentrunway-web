/**
 * GET /api/accountant-share?token=xxx
 *
 * Public endpoint (no auth required) — validates the accountant share token
 * and returns read-only financial data for the agent.
 *
 * Returns only data the agent has opted to share (t2125, expenses, transactions, mileage).
 */

import { NextResponse } from "next/server";

export async function GET() {
  // Accountant share feature temporarily disabled — will be re-enabled in a future release
  return NextResponse.json(
    { error: "This feature is not yet available" },
    { status: 503 }
  );
}
