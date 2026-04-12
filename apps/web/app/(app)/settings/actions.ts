"use server";

import { createClient } from "@/lib/supabase/server";

export async function dismissAiProfilePrompt() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("user_settings")
    .update({ ai_profile_prompt_dismissed_at: new Date().toISOString() })
    .eq("user_id", user.id);
}
