import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Block in sandbox mode
  const { data: sbCheck } = await supabase
    .from("user_settings")
    .select("sandbox_mode")
    .eq("user_id", user.id)
    .single();
  if (sbCheck?.sandbox_mode === true) {
    return NextResponse.json({ error: "Blocked in sandbox mode." }, { status: 403 });
  }

  const { error } = await supabase
    .from("google_connections")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    console.error("[google/disconnect] Error:", error.message);
    return NextResponse.json({ error: "Failed to disconnect Google account." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
