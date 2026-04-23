/**
 * GET /api/auth/google/connect
 *
 * CASA-shelved: Google integration paused pending CASA security audit.
 * Full implementation preserved in git history (commit before db8af86).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Google integration is temporarily unavailable." },
    { status: 503 }
  );
}
