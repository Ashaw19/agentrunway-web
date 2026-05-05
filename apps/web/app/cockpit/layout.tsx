import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { createClient } from "@/lib/supabase/server";
import { CockpitShell } from "./cockpit-shell";

export const metadata: Metadata = {
  title: "Cockpit",
  description: "Agent Runway Inc. corporate dashboard",
  robots: { index: false, follow: false },
  manifest: "/cockpit/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Cockpit", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#1d2a45",
};

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

export default async function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/cockpit");
  if (!user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) redirect("/dashboard");

  return <CockpitShell>{children}</CockpitShell>;
}
