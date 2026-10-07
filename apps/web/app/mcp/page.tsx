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
  Target,
  type LucideIcon,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { webPageSchema, breadcrumbSchema } from "@/lib/schema";
import { MCP_TOOL_CATALOG, MCP_TOOL_COUNTS } from "@/lib/mcp-server/tool-catalog";

const { total: TOOL_TOTAL, read: READ_TOOLS, write: WRITE_TOOLS } = MCP_TOOL_COUNTS;

export const metadata: Metadata = {
  title: "MCP Server: Connect AI to Your Real Estate Data",
  description: `Connect an MCP client such as Claude or Cursor to your Agent Runway business data. ${READ_TOOLS} read tools for transactions, pipeline, CRM, expenses, forecasts and Canadian tax estimates, plus ${WRITE_TOOLS} write tools for pipeline opportunities.`,
  openGraph: {
    url: "https://agentrunway.ca/mcp",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/mcp",
  },
};

const mcpWebPage = webPageSchema({
  name: "Agent Runway MCP Server: Connect AI to Your Real Estate Data",
  description: `The Agent Runway MCP server has ${TOOL_TOTAL} tools. ${READ_TOOLS} read transactions, pipeline, CRM, expenses, forecasts and Canadian tax estimates. ${WRITE_TOOLS} write tools create and update pipeline opportunities. It works with MCP clients that can send a Bearer token, such as Claude or Cursor.`,
  url: "/mcp",
  lastReviewed: "2026-10-07",
});

const mcpBreadcrumb = breadcrumbSchema([
  { name: "Home",       url: "/" },
  { name: "MCP Server", url: "/mcp" },
]);

// Icon styling per catalog group. Tool names, descriptions and read/write
// labels come from MCP_TOOL_CATALOG, which a test checks against the server.
const GROUP_STYLE: Record<string, { icon: LucideIcon; iconClass: string }> = {
  Analytics: { icon: BarChart3, iconClass: "text-blue-400" },
  Transactions: { icon: Receipt, iconClass: "text-emerald-400" },
  Pipeline: { icon: Zap, iconClass: "text-amber-400" },
  Opportunities: { icon: Target, iconClass: "text-orange-400" },
  CRM: { icon: Users, iconClass: "text-purple-400" },
  "Expenses & Mileage": { icon: Receipt, iconClass: "text-rose-400" },
  "Outreach & Settings": { icon: MessageSquare, iconClass: "text-cyan-400" },
};

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
              Agent Runway&apos;s MCP server lets an AI assistant such as
              Claude or Cursor work with your business data directly.{" "}
              {READ_TOOLS} tools read your transactions, pipeline, CRM,
              expenses, forecasts and Canadian tax estimates. {WRITE_TOOLS}{" "}
              tools create or update pipeline opportunities.
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
                View All {TOOL_TOTAL} Tools
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
                  desc: "Point your MCP client at our endpoint and send your Agent Runway session token as a Bearer token. It expires after about an hour.",
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
                The token is the Supabase access token (JWT) from a signed-in
                Agent Runway session. It expires after about an hour. The app
                doesn&apos;t show it on any screen, so you have to copy a fresh
                one from a signed-in browser session. There are no API keys,
                and OAuth sign-in is not available. Pro access required. Every
                query runs as you, so row-level security applies.
              </p>
            </div>
          </div>
        </section>

        {/* ── Tools Grid ───────────────────────────────────────── */}
        <section id="tools" className="bg-slate-900/50 px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-4 text-center text-3xl font-bold text-white">
              {TOOL_TOTAL} Tools, One Server
            </h2>
            <p className="mx-auto mb-12 max-w-2xl text-center text-slate-400">
              Every tool returns JSON. {READ_TOOLS} tools only read data. The{" "}
              {WRITE_TOOLS} marked <span className="text-amber-300">write</span>{" "}
              create or change pipeline opportunities, and
              mark_opportunity_lost is flagged destructive.
            </p>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {MCP_TOOL_CATALOG.map((group) => {
                const { icon: Icon, iconClass } =
                  GROUP_STYLE[group.category] ?? GROUP_STYLE.Analytics;
                return (
                  <div
                    key={group.category}
                    className="rounded-xl border border-slate-800 bg-slate-900 p-5"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${iconClass}`} />
                      <h3 className="font-semibold text-white">
                        {group.category}
                      </h3>
                    </div>
                    <ul className="space-y-2">
                      {group.tools.map((tool) => (
                        <li key={tool.name}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <code className="text-xs text-blue-400">
                              {tool.name}
                            </code>
                            {tool.access === "write" && (
                              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                                {tool.destructive ? "write, destructive" : "write"}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{tool.desc}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Security ─────────────────────────────────────────── */}
        <section className="px-6 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <Shield className="mx-auto mb-4 h-10 w-10 text-emerald-400" />
            <h2 className="mb-4 text-2xl font-bold text-white">
              Security
            </h2>
            <div className="grid gap-4 text-left sm:grid-cols-2">
              {[
                "Bearer token auth with your session token (Supabase JWT, expires after about an hour)",
                "Queries run as you, so row-level security applies",
                "Pro access required, no anonymous access",
                "Usage logs deleted after 90 days",
                "No sensitive financial credentials returned",
                `${WRITE_TOOLS} write tools, labelled so your MCP client can ask before running them`,
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
