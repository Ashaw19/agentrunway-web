import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FLIGHT_PLAN_DEFAULTS } from "@/lib/flight-plan-defaults";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sandboxCheck } = await supabase.from("user_settings").select("sandbox_mode").eq("user_id", user.id).single();
  if (sandboxCheck?.sandbox_mode === true) {
    return NextResponse.json({ error: "Action blocked in Sandbox Mode" }, { status: 403 });
  }

  // Fetch existing system_keys for this user so we can skip duplicates
  const { data: existing } = await supabase
    .from("flight_plans")
    .select("system_key")
    .eq("user_id", user.id)
    .not("system_key", "is", null);

  const existingKeys = new Set((existing ?? []).map((r) => r.system_key as string));

  const toSeed = FLIGHT_PLAN_DEFAULTS.filter((d) => !existingKeys.has(d.system_key));

  if (toSeed.length === 0) {
    return NextResponse.json({ seeded: 0, message: "All defaults already loaded" });
  }

  let seeded = 0;

  for (const def of toSeed) {
    // Insert the flight plan
    const { data: plan, error: planError } = await supabase
      .from("flight_plans")
      .insert({
        user_id:        user.id,
        name:           def.name,
        description:    def.description,
        trigger_status: def.trigger_status,
        trigger_tag:    def.trigger_tag,
        is_active:      true,
        is_system:      true,
        system_key:     def.system_key,
      })
      .select("id")
      .single();

    if (planError || !plan) continue;

    // Insert the steps
    if (def.steps.length > 0) {
      await supabase.from("flight_plan_steps").insert(
        def.steps.map((s) => ({
          flight_plan_id: plan.id,
          step_order:     s.step_order,
          delay_days:     s.delay_days,
          action_type:    s.action_type,
          template:       s.template,
        })),
      );
    }

    seeded++;
  }

  return NextResponse.json({ seeded, message: `${seeded} campaign${seeded !== 1 ? "s" : ""} loaded` });
}
