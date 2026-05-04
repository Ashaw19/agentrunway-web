import type { Metadata } from "next";
import Link from "next/link";
import {
  MessageSquare,
  BarChart3,
  Users,
  Receipt,
  Shield,
  Zap,
  ArrowRight,
  Terminal,
  Lock,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { webPageSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "MCP Server — Connect AI to Your Real Estate Data",
  description:
    "Connect Claude, Cursor, or any MCP-compatible AI assistant to your Agent Runway business data. 16 tools for transactions, pipeline, CRM, expenses, forecasts, and Canadian tax estimates.",
  openGraph: {
    url: "https://agentrunway.ca/mcp",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/mcp",
  },
};

const mcpWebPage = webPageSchema({
  name:
    "Agent Runway MCP Server — Connect AI to Your Real Estate Data",
  description:
    "The Agent Runway MCP server exposes 16 read-only tools for transactions, pipeline, CRM, expenses, forecasts, and Canadian tax estimates. Compatible with Claude, Cursor, and any MCP client.",
  url: "/mcp",
  lastReviewed: "2026-04-16",
});

const mcpBreadcrumb = breadcrumbSchema([
  { name: "Home",       url: "/" },
  { name: "MCP Server", url: "/mcp" },
]);

const TOOLS = [
  {
    category: "Analytics",
    icon: BarChart3,
    iconClass: "text-blue-400",
    items: [
      { name: "get_dashboard_kpis", desc: "YTD GCI, transactions, expenses, pipeline, goal progress" },
      { name: "get_runway_score", desc: "0-100 business health grade (A+ to F)" },
      { name: "get_forecast", desc: "Projected year-end GCI from pace + pipeline" },
      { name: "get_tax_estimate", desc: "Canadian income tax with CPP, federal/provincial, quarterly installments" },
    ],
  },
  {
    category: "Transactions",
    icon: Receipt,
    iconClass: "text-emerald-400",
    items: [
      { name: "get_transactions", desc: "Closed deals with address, price, GCI, side, date" },
      { name: "get_transaction_summary", desc: "Aggregate GCI and volume by year" },
    ],
  },
  {
    category: "Pipeline",
    icon: Zap,
    iconClass: "text-amber-400",
    items: [
      { name: "get_pipeline", desc: "Active deals with stage, probability, weighted GCI" },
      { name: "get_pipeline_forecast", desc: "Stage-by-stage breakdown with goal coverage ratio" },
    ],
  },
  {
    category: "CRM",
    icon: Users,
    iconClass: "text-purple-400",
    items: [
      { name: "get_clients", desc: "Client list with flight status, contact info, property interest" },
      { name: "get_client_detail", desc: "Full profile with activities and pipeline deals" },
    ],
  },
  {
    category: "Expenses & Mileage",
    icon: Receipt,
    iconClass: "text-rose-400",
    items: [
      { name: "get_expenses", desc: "YTD expenses by category with recurring totals" },
      { name: "get_mileage_summary", desc: "Business mileage log with CRA deduction" },
    ],
  },
  {
    category: "Outreach & Settings",
    icon: MessageSquare,
    iconClass: "text-cyan-400",
    items: [
      { name: "get_flight_control_priorities", desc: "Outreach queue with AI-drafted messages" },
      { name: "get_user_settings", desc: "Profile, goals, business settings, subscription" },
    ],
  },
];

export default function McpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(mcpWebPage) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(mcpBreadcrumb) }}
      />
      <MarketingNav />

      <main>
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="relative overflow-hidden px-6 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300">
              <Terminal className="h-4 w-4" />
              Model Context Protocol
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Connect AI to Your{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Real Estate Data
              </span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              Agent Runway&apos;s MCP server lets Claude, Cursor, and any
              MCP-compatible AI assistant query your business data directly.
              16 tools covering transactions, pipeline, CRM, expenses,
              forecasts, and Canadian tax estimates.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500"
              >
                Get Pro Access
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#tools"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                View All 16 Tools
              </a>
            </div>
          </div>
        </section>

        {/* ── How It Works ─────────────────────────────────────── */}
        <section className="bg-slate-900/50 px-6 py-20">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-12 text-center text-3xl font-bold text-white">
              How It Works
            </h2>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Subscribe to Pro",
                  desc: "MCP access is included with every Agent Runway Pro subscription. No extra cost.",
                  icon: Shield,
                },
                {
                  step: "2",
                  title: "Add the Server URL",
                  desc: "Point your MCP client to our endpoint with your access token as Bearer auth.",
                  icon: Terminal,
                },
                {
                  step: "3",
                  title: "Ask Your AI Anything",
                  desc: "\"How's my pipeline looking?\" Your AI calls the right tools and responds with real data.",
                  icon: MessageSquare,
                },
              ].map((s) => (
                <div
                  key={s.step}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-6"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-sm font-bold text-blue-400">
                    {s.step}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-white">
                    {s.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Server URL ───────────────────────────────────────── */}
        <section className="px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-center text-2xl font-bold text-white">
              Server Configuration
            </h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
                <Lock className="h-4 w-4" />
                Streamable HTTP &middot; Bearer Token Auth &middot; MCP
                2024-11-05
              </div>
              <div className="rounded-lg bg-slate-950 p-4 font-mono text-sm text-slate-300">
                <div className="mb-1 text-slate-500">
                  # MCP Server URL
                </div>
                <div className="break-all text-blue-400">
                  https://wlxkvnbncfzkmxzexgxt.supabase.co/functions/v1/mcp-server
                </div>
                <div className="mt-3 mb-1 text-slate-500">
                  # Authentication
                </div>
                <div>
                  Authorization: Bearer{" "}
                  <span className="text-emerald-400">
                    &lt;your-supabase-access-token&gt;
                  </span>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Your access token is the Supabase JWT from your Agent Runway
                session. Pro subscription required. All queries are
                RLS-enforced — you only see your own data.
              </p>
            </div>
          </div>
        </section>

        {/* ── Tools Grid ───────────────────────────────────────── */}
        <section id="tools" className="bg-slate-900/50 px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-4 text-center text-3xl font-bold text-white">
              16 Tools, One Server
            </h2>
            <p className="mx-auto mb-12 max-w-2xl text-center text-slate-400">
              Every tool returns structured JSON. Your AI assistant knows
              exactly what to call based on your question.
            </p>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {TOOLS.map((group) => (
                <div
                  key={group.category}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-5"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <group.icon className={`h-5 w-5 ${group.iconClass}`} />
                    <h3 className="font-semibold text-white">
                      {group.category}
                    </h3>
                  </div>
                  <ul className="space-y-2">
                    {group.items.map((tool) => (
                      <li key={tool.name}>
                        <code className="text-xs text-blue-400">
                          {tool.name}
                        </code>
                        <p className="text-xs text-slate-500">{tool.desc}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Security ─────────────────────────────────────────── */}
        <section className="px-6 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <Shield className="mx-auto mb-4 h-10 w-10 text-emerald-400" />
            <h2 className="mb-4 text-2xl font-bold text-white">
              Secure by Design
            </h2>
            <div className="grid gap-4 text-left sm:grid-cols-2">
              {[
                "Bearer token authentication (Supabase JWT)",
                "Row-level security — only your data, always",
                "Pro subscription gate — no anonymous access",
                "90-day auto-purge on usage logs",
                "No sensitive financial credentials exposed",
                "CORS-enabled for any MCP client",
              ].map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-2 text-sm text-slate-400"
                >
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  {point}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────── */}
        <section className="bg-gradient-to-b from-slate-900/50 to-slate-950 px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold text-white">
              Ready to Connect?
            </h2>
            <p className="mb-8 text-slate-400">
              Get an Agent Runway Pro subscription and start querying your
              real estate business data through AI in minutes.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500"
            >
              View Pricing
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
