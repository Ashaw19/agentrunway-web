import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResolutionsClient } from "./resolutions-client";
import type { CorpResolution } from "@agent-runway/core/types/database";

export const dynamic = "force-dynamic";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

export default async function ResolutionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const { data } = await supabase
    .from("corp_resolutions")
    .select("*")
    .order("passed_date", { ascending: false })
    .order("created_at", { ascending: false });

  const resolutions = (data ?? []) as CorpResolution[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Minute Book</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Director resolutions for Agent Runway Inc. — auto-numbered{" "}
          <code className="text-xs text-amber-300/80">YYYY-DR-NNN</code>.
        </p>
      </div>
      <ResolutionsClient initialResolutions={resolutions} />
    </div>
  );
}
