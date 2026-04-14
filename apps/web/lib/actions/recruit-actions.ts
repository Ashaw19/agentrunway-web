"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/org-context";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

/**
 * Create a new recruitment page for the current user's org.
 */
export async function createRecruitmentPage(): Promise<
  ActionResult<{ id: string; token: string }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const orgContext = await getOrgContext();
  if (!orgContext || !orgContext.isAdmin) {
    return { data: null, error: "Not authorized" };
  }

  // Check if a page already exists for this org
  const { data: existing } = await supabase
    .from("recruitment_pages")
    .select("id, token")
    .eq("org_id", orgContext.org.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { data: { id: existing.id, token: existing.token }, error: null };
  }

  const token = crypto.randomUUID();

  const { data: page, error } = await supabase
    .from("recruitment_pages")
    .insert({
      org_id: orgContext.org.id,
      created_by: user.id,
      token,
      headline: "Join Our Team",
      description: `We're growing and looking for talented agents to join ${orgContext.org.name}.`,
      is_active: true,
      show_team_stats: true,
      show_value_props: true,
    })
    .select("id, token")
    .single();

  if (error || !page) {
    console.error("[recruit] Create page error:", error);
    return { data: null, error: "Failed to create recruitment page" };
  }

  return { data: { id: page.id, token: page.token }, error: null };
}

/**
 * Toggle is_active on a recruitment page.
 */
export async function toggleRecruitmentPage(
  pageId: string,
  isActive: boolean,
): Promise<ActionResult<{ ok: true }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const orgContext = await getOrgContext();
  if (!orgContext || !orgContext.isAdmin) {
    return { data: null, error: "Not authorized" };
  }

  const { error } = await supabase
    .from("recruitment_pages")
    .update({ is_active: isActive })
    .eq("id", pageId)
    .eq("org_id", orgContext.org.id);

  if (error) {
    console.error("[recruit] Toggle error:", error);
    return { data: null, error: "Failed to update page" };
  }

  return { data: { ok: true }, error: null };
}

/**
 * Update an application's status.
 */
export async function updateApplicationStatus(
  applicationId: string,
  status: string,
): Promise<ActionResult<{ ok: true }>> {
  const validStatuses = [
    "new",
    "contacted",
    "interviewing",
    "offered",
    "hired",
    "declined",
  ];
  if (!validStatuses.includes(status)) {
    return { data: null, error: "Invalid status" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const orgContext = await getOrgContext();
  if (!orgContext || !orgContext.isAdmin) {
    return { data: null, error: "Not authorized" };
  }

  // Use admin client to update since RLS on recruitment_applications only has SELECT for org admins
  const admin = createAdminClient();

  // Verify this application belongs to one of the org's recruitment pages
  const { data: app } = await admin
    .from("recruitment_applications")
    .select("id, recruitment_page_id, recruitment_pages!inner(org_id)")
    .eq("id", applicationId)
    .single();

  if (
    !app ||
    (app.recruitment_pages as unknown as { org_id: string }).org_id !==
      orgContext.org.id
  ) {
    return { data: null, error: "Application not found" };
  }

  const { error } = await admin
    .from("recruitment_applications")
    .update({ status })
    .eq("id", applicationId);

  if (error) {
    console.error("[recruit] Update status error:", error);
    return { data: null, error: "Failed to update status" };
  }

  return { data: { ok: true }, error: null };
}
