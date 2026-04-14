import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { RecruitContent } from "./recruit-content";

export default async function RecruitPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgContext = await getOrgContext();
  if (!orgContext || !orgContext.isAdmin) {
    redirect("/org");
  }

  // Fetch recruitment pages for this org
  const { data: pages } = await supabase
    .from("recruitment_pages")
    .select("*")
    .eq("org_id", orgContext.org.id)
    .order("created_at", { ascending: false });

  const recruitmentPage = pages?.[0] ?? null;

  // Fetch applications if a page exists
  let applications: Array<{
    id: string;
    recruitment_page_id: string;
    applicant_name: string;
    applicant_email: string;
    applicant_phone: string;
    years_experience: number;
    current_brokerage: string;
    message: string;
    resume_url: string;
    status: string;
    created_at: string;
  }> = [];

  if (recruitmentPage) {
    const { data: apps } = await supabase
      .from("recruitment_applications")
      .select("*")
      .eq("recruitment_page_id", recruitmentPage.id)
      .order("created_at", { ascending: false });

    applications = (apps ?? []) as typeof applications;
  }

  return (
    <RecruitContent
      orgName={orgContext.org.name}
      recruitmentPage={
        recruitmentPage
          ? {
              id: recruitmentPage.id,
              token: recruitmentPage.token,
              is_active: recruitmentPage.is_active,
              headline: recruitmentPage.headline,
              view_count: recruitmentPage.view_count ?? 0,
              application_count: recruitmentPage.application_count ?? 0,
              created_at: recruitmentPage.created_at,
            }
          : null
      }
      applications={applications}
    />
  );
}
