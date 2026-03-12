import { createClient }  from "@/lib/supabase/server";
import { redirect }       from "next/navigation";
import { MileageContent } from "./mileage-content";

export default async function MileagePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const year = new Date().getFullYear();

  const [logsResult, settingsResult] = await Promise.all([
    supabase
      .from("mileage_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("trip_date", `${year}-01-01`)
      .lte("trip_date", `${year}-12-31`)
      .order("trip_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("user_settings")
      .select("display_name, province")
      .eq("user_id", user.id)
      .single(),
  ]);

  return (
    <MileageContent
      initialLogs={logsResult.data ?? []}
      year={year}
      settings={settingsResult.data}
    />
  );
}
