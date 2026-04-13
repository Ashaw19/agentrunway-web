import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ClientsContent } from "./clients-content";
import type { Client, ClientRecord, ContactActivity, ContactTask, UserSettings, ExpenseItem, ClientRelationship, FlightPlan, FlightPlanStep, PropertyShowing, ListingAppointment } from "@/lib/types/database";


/**
 * Threshold: if a user has more than this many clients, skip sending them
 * in the RSC payload and let the client component fetch them directly.
 * This avoids massive RSC payloads that can crash the browser or timeout.
 */
const CLIENT_SIDE_FETCH_THRESHOLD = 500;

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Step 1: Fetch settings first to determine data source ───────────────
  const { data: settingsData } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const settings = settingsData as UserSettings | null;

  // ── Check client count to decide fetch strategy ─────────────────────────
  const { count: clientCount } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const useClientSideFetch = (clientCount ?? 0) > CLIENT_SIDE_FETCH_THRESHOLD;

  // ── Live Supabase queries ───────────────────────────────────────────────
  const queries = [
    // Only fetch clients server-side if below threshold
    useClientSideFetch
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("clients")
          .select("*")
          .eq("user_id", user.id)
          .order("name")
          .limit(10000),
    supabase
      .from("client_records")
      .select("*")
      .eq("user_id", user.id)
      .order("year", { ascending: false })
      .order("name")
      .limit(10000),
    // Last 500 activities across all clients (for analytics + activity feed)
    supabase
      .from("contact_activities")
      .select("*")
      .eq("user_id", user.id)
      .order("activity_date", { ascending: false })
      .limit(500),
    // All open tasks (not completed) for task panel + dashboard
    supabase
      .from("contact_tasks")
      .select("*")
      .eq("user_id", user.id)
      .is("completed_at", null)
      .order("due_date", { ascending: true })
      .limit(10000),
    supabase
      .from("expense_items")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("client_relationships")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("flight_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase
      .from("flight_plan_steps")
      .select("*")
      .eq("user_id", user.id)
      .order("step_order", { ascending: true })
      .limit(10000),
    supabase
      .from("property_showings")
      .select("*")
      .eq("user_id", user.id)
      .order("showing_date", { ascending: false })
      .limit(10000),
    supabase
      .from("listing_appointments")
      .select("*")
      .eq("user_id", user.id)
      .order("appointment_date", { ascending: false })
      .limit(10000),
  ] as const;

  const [clientsResult, recordsResult, activitiesResult, tasksResult, expensesResult, relationshipsResult, flightPlansResult, flightPlanStepsResult, showingsResult, listingApptsResult] = await Promise.all(queries);

  return (
    <ClientsContent
      clients={(clientsResult.data ?? []) as Client[]}
      records={(recordsResult.data ?? []) as ClientRecord[]}
      activities={(activitiesResult.data ?? []) as ContactActivity[]}
      tasks={(tasksResult.data ?? []) as ContactTask[]}
      settings={settings}
      expenseItems={(expensesResult.data ?? []) as ExpenseItem[]}
      relationships={(relationshipsResult.data ?? []) as ClientRelationship[]}
      flightPlans={(flightPlansResult.data ?? []) as FlightPlan[]}
      flightPlanSteps={(flightPlanStepsResult.data ?? []) as FlightPlanStep[]}
      showings={(showingsResult.data ?? []) as PropertyShowing[]}
      listingAppointments={(listingApptsResult.data ?? []) as ListingAppointment[]}
      userId={user.id}
    />
  );
}
