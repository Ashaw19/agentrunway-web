/**
 * POST /api/google/drive/refine
 *
 * CASA-shelved: Google integration paused pending CASA security audit.
 * Full implementation preserved in git history (commit before db8af86).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Google integration is temporarily unavailable." },
    { status: 503 }
  );
}
