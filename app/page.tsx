import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, TrendingUp, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

// Override the root layout's template so this page gets the exact canonical title
export const metadata: Metadata = {
  title: "Agent Runway | Business Analytics for Real Estate Agents",
  description:
    "Agent Runway helps real estate agents track GCI, forecast income, measure financial runway, and receive AI-powered insights about their business performance.",
  openGraph: {
    url: "https://agentrunway.ca",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const FEATURES = [
  { icon: BarChart3,  label: "Track GCI" },
  { icon: TrendingUp, label: "Forecast Income" },
  { icon: Shield,     label: "Measure Financial Runway" },
  { icon: Sparkles,   label: "AI Business Insights" },
];

export default async function Home() {
  // Authenticated users skip the landing page entirely
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">

      {/* ── Nav ── */}
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-lg font-bold tracking-tight">Agent Runway</span>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">Sign In</Link>
        </Button>
      </header>

      {/* ── Hero ── */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center sm:px-10">
        <div className="mx-auto max-w-2xl space-y-7">

          {/* Badge */}
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
            Built for Canadian Real Estate Agents
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Agent Runway
          </h1>

          {/* Subheadline */}
          <p className="text-xl font-medium text-muted-foreground sm:text-2xl">
            Business Analytics for Real Estate Agents
          </p>

          {/* Body copy */}
          <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Agent Runway helps you track GCI, forecast full-year income, measure
            your financial runway, and receive AI-powered insights — all in one
            clean dashboard built around your numbers.
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link href="/login">Get Started</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </div>

        </div>
      </main>

      {/* ── Feature strip ── */}
      <section className="border-t bg-muted/30 px-6 py-10 sm:px-10">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2.5 text-center"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-6 py-4 text-center text-xs text-muted-foreground sm:px-10">
        © {new Date().getFullYear()} Agent Runway. All rights reserved.
      </footer>

    </div>
  );
}
