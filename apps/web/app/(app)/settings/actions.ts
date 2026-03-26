"use server";

import { createClient } from "@/lib/supabase/server";

export async function dismissAiProfilePrompt() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Block writes in sandbox mode
  const { data: sbCheck } = await supabase
    .from("user_settings")
    .select("sandbox_mode")
    .eq("user_id", user.id)
    .single();
  if (sbCheck?.sandbox_mode === true) return;

  await supabase
    .from("user_settings")
    .update({ ai_profile_prompt_dismissed_at: new Date().toISOString() })
    .eq("user_id", user.id);
}
