"use server";

import { createClient } from "@/lib/supabase/server";
import { isUserInSandbox } from "@/lib/sandbox-guard";

export async function dismissAiProfilePrompt() {
  if (await isUserInSandbox()) return;
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
