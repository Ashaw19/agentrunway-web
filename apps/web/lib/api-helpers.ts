import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Standard JSON error response */
export function apiError(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

/** Authenticate the request and return the user. Returns [supabase, user] or a NextResponse error. */
export async function authenticateRequest(): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; error?: never }
  | { error: NextResponse; supabase?: never; userId?: never }
> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: apiError("Unauthorized", 401) };
  }
  return { supabase, userId: user.id };
}
