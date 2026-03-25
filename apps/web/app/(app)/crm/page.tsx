import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ClientsContent } from "./clients-content";
import type { Client, ClientRecord, ContactActivity, ContactTask, UserSettings, ExpenseItem, ClientRelationship, FlightPlan, FlightPlanStep, PropertyShowing, ListingAppointment } from "@/lib/types/database";
import { isSandboxActive, getSandboxData, mergeSandboxSettings, getSandboxExpenseItems } from "@/lib/sandbox-resolver";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Step 1: Fetch settings first to determine data source ───────────────
  const { data: settingsData } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const settings = settingsData as UserSettings | null;

  // ── Step 2: Resolve data from sandbox or Supabase ───────────────────────
  if (isSandboxActive(settings)) {
    const sb = getSandboxData(settings);
    const mergedSettings = mergeSandboxSettings(settings);
    const expenseItems = getSandboxExpenseItems(sb);

    return (
      <ClientsContent
        clients={sb.clients}
        records={sb.clientRecords}
        activities={sb.contactActivities.slice(0, 500)}
        tasks={sb.contactTasks.filter((t) => t.completed_at === null)}
        settings={mergedSettings}
        expenseItems={expenseItems as ExpenseItem[]}
        relationships={sb.clientRelationships}
        flightPlans={sb.flightPlans}
        flightPlanSteps={sb.flightPlanSteps}
        showings={sb.propertyShowings}
        listingAppointments={sb.listingAppointments}
      />
    );
  }

  // ── Step 3: Live Supabase queries ───────────────────────────────────────
  const [clientsResult, recordsResult, activitiesResult, tasksResult, expensesResult, relationshipsResult, flightPlansResult, flightPlanStepsResult, showingsResult, listingApptsResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id, user_id, name, name_search, first_name, last_name, email, phone, status, tags, last_contact_at, lead_source, archived_at, archive_reason")
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
  ]);

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
    />
  );
}
