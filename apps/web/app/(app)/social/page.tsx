import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SocialContent } from "./social-content";

export default async function SocialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [settingsResult, txResult, connectionsResult] = await Promise.all([
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "closed")
      .order("date", { ascending: false }),
    supabase
      .from("social_connections")
      .select("platform, account_name, token_expires_at, account_id")
      .eq("user_id", user.id),
  ]);

  return (
    <SocialContent
      settings={settingsResult.data}
      transactions={txResult.data ?? []}
      connections={connectionsResult.data ?? []}
    />
  );
}
