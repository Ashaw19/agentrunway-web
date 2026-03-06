import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PipelineContent } from "./pipeline-content";

export default async function PipelinePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deals } = await supabase
    .from("pipeline_deals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return <PipelineContent initialDeals={deals ?? []} />;
}
