import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Compass,
  Radio,
  Calculator,
  Layers,
  Map as MapIcon,
  Home,
  FileText,
  Building2,
  Receipt,
  Percent,
  Clock,
  Shield,
  Sparkles,
  CheckCircle2,
  XCircle,
  BookOpen,
  Gauge,
  TrendingUp,
} from "lucide-react";
import { Tailfin } from "@/components/icons/brand-icons";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import {
  webPageSchema,
  breadcrumbSchema,
  collectionPageSchema,
} from "@/lib/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_URL =
  "https://agentrunway.ca/canadian-real-estate-agent-financial-platform";

export const metadata: Metadata = {
  title:
    "The Canadian Financial Layer for Real Estate Agents | Agent Runway",
  description:
    "Agent Runway is the business financial layer top Canadian real estate agents run alongside their CRM — CRA-aware tax estimates, HST tracking, T2125 reconciliation, runway in months, and a Flight Crew that reads your numbers. Built for all 13 provinces and territories.",
  keywords: [
    "canadian real estate agent financial software",
    "real estate agent business platform canada",
    "realtor finance software canada",
    "canadian realtor tax software",
    "real estate agent T2125 software",
    "real estate agent HST tracking canada",
    "canadian realtor business intelligence",
    "real estate runway score canada",
  ],
  openGraph: {
    type: "website",
    url: PAGE_URL,
    title:
      "The Canadian Financial Layer for Real Estate Agents | Agent Runway",
    description:
      "Built for Canadian agents — CRA-aware tax estimates, HST tracking, T2125 reconciliation, runway in months, and a Flight Crew that reads your numbers. The financial layer that sits alongside your CRM.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: PAGE_URL,
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const PAGE_SCHEMA = webPageSchema({
  name: "The Canadian Financial Layer for Real Estate Agents",
  description:
    "Agent Runway is the business financial layer top Canadian real estate agents run alongside their CRM. CRA-aware tax estimates, HST tracking, T2125 reconciliation, runway in months, and a Flight Crew that reads your numbers.",
  url: "/canadian-real-estate-agent-financial-platform",
  lastReviewed: "2026-05-09",
});

const BREADCRUMB = breadcrumbSchema([
  { name: "Home", url: "/" },
  {
    name: "Canadian Financial Layer",
    url: "/canadian-real-estate-agent-financial-platform",
  },
]);

const CLUSTER_COLLECTION = collectionPageSchema({
  name: "Canadian Real Estate Agent Finance — Topic Cluster",
  description:
    "Long-form coverage of the Canadian-specific financial questions self-employed real estate agents face year-round — HST, T2125, PREC, instalments, provincial rates, CPP, and tools.",
  url: "/canadian-real-estate-agent-financial-platform",
  items: [
    {
      name: "Free Canadian Realtor Tax Estimator",
      url: "/tools/realtor-tax-estimator",
      description:
        "Federal + provincial tax + CPP estimator covering all 13 provinces and territories.",
    },
    {
      name: "First-Year Tax Filing for Newly-Licensed Canadian Real Estate Agents",
      url: "/first-year-tax-filing-real-estate-agents-canada",
      description:
        "The CRA sequence from licence day to first T1 filing — T2125, the $30,000 HST threshold, the April 30 / June 15 deadline split, CPP, and the year-one mistakes that compound.",
    },
    {
      name: "What's Missing Between Your Accountant, CRM, and Spreadsheet",
      url: "/real-estate-agent-tools-canada",
      description:
        "Where the default Canadian agent stack leaves a year-round gap, and what fills it.",
    },
    {
      name: "HST/GST Registration for Canadian Real Estate Agents",
      url: "/real-estate-agent-hst-registration-canada",
      description:
        "$30K small-supplier threshold, ITCs, provincial rates, filing frequency.",
    },
    {
      name: "T2125 Guide for Canadian Real Estate Agents",
      url: "/t2125-guide-real-estate-agents-canada",
      description: "Statement of Business Activities, line by line.",
    },
    {
      name: "PREC vs Sole Proprietor for Real Estate Agents in Canada",
      url: "/prec-vs-sole-proprietor-real-estate-agents-canada",
      description:
        "Personal Real Estate Corporation considerations versus sole-prop, in plain language.",
    },
    {
      name: "Real Estate Agent Tax Instalments in Canada",
      url: "/real-estate-agent-tax-instalments-canada",
      description: "How CRA quarterly instalments work for self-employed agents.",
    },
    {
      name: "NB / NS / PEI Tax Rates for Real Estate Agents",
      url: "/real-estate-agent-tax-rates-nb-ns-pei",
      description:
        "Combined federal + provincial marginal rates for Atlantic Canadian agents.",
    },
    {
      name: "CPP for Self-Employed Real Estate Agents in Canada",
      url: "/self-employed-cpp-real-estate-agents-canada",
      description: "How CPP works when you're self-employed and there's no employer half.",
    },
    {
      name: "Real Estate Agent Business Expenses in Canada",
      url: "/real-estate-agent-business-expenses-canada",
      description: "What's deductible on T2125 — and what isn't.",
    },
    {
      name: "Vehicle Expenses for Real Estate Agents in Canada",
      url: "/vehicle-expenses-real-estate-agents-canada",
      description:
        "Logbook, Class 10.1 ceiling, lease and interest caps, and the 90% GST/HST ITC threshold for sole proprietors.",
    },
    {
      name: "Business-Use-of-Home Expenses for Real Estate Agents in Canada",
      url: "/business-use-of-home-real-estate-agents-canada",
      description:
        "T2125 Line 9945, the two qualifying tests, the loss-limit carryforward, and the principal-residence CCA trap.",
    },
    {
      name: "GST/HST Quick Method for Canadian Real Estate Agents",
      url: "/gst-hst-quick-method-real-estate-agents-canada",
      description:
        "$400K turnover ceiling, service-provider remittance rates, the 1% credit on first $30K, GST74 election, and the operating-expense ITC trade-off.",
    },
    {
      name: "Real Estate Tax Deadlines in Canada",
      url: "/real-estate-tax-deadlines-canada",
      description: "April, June, instalment quarters, HST filing.",
    },
    {
      name: "Real Estate Agent Tax Planning Canada",
      url: "/real-estate-agent-tax-planning-canada",
      description: "Year-round considerations for Canadian agents.",
    },
    {
      name: "How Much Should Real Estate Agents Save for Taxes",
      url: "/how-much-should-real-estate-agents-save-for-taxes-canada",
      description: "What CRA rates indicate for Canadian agent earnings.",
    },
    {
      name: "Capital Gains Tax for Canadian Real Estate Agents Who Invest Personally",
      url: "/capital-gains-real-estate-agents-canada",
      description:
        "Flip-vs-hold classification, the principal residence exemption, the 365-day anti-flipping rule, section 45 change-of-use elections, CCA recapture, the QSBC lifetime exemption, and the current 50% inclusion rate.",
    },
  ],
});

// ─── Capability data ──────────────────────────────────────────────────────────

interface Capability {
  icon: typeof Calculator;
  iconClass: string;
  bgClass: string;
  name: string;
  body: string;
  link?: { href: string; label: string };
}

const CAPABILITIES: Capability[] = [
  {
    icon: TrendingUp,
    iconClass: "text-blue-500",
    bgClass: "bg-blue-50",
    name: "Real income tracking",
    body:
      "Every transaction updates your real income — after splits, brokerage fees, referral payouts, and the deductible expenses that actually show up on T2125. The dashboard estimates your year-to-date net, your effective expense ratio, and your repeat-client rate against closed transactions only. Numbers are estimates from your reported data, surfaced as information rather than filing advice.",
    link: { href: "/how-real-estate-agents-track-gci", label: "How GCI tracking works" },
  },
  {
    icon: Sparkles,
    iconClass: "text-emerald-500",
    bgClass: "bg-emerald-50",
    name: "Year-end GCI forecast",
    body:
      "Not a straight-line guess. The forecast engine reads the deals already in motion (Boarding, Scheduled, In-Flight, Cruising), weighs them by stage probability, and adjusts for Canadian seasonality — slow February, busy spring, summer plateau, fall closes, December lull. The output is a P10–P90 probability band: the range your year may land in given your current pipeline, not a single false-precision number.",
  },
  {
    icon: Gauge,
    iconClass: "text-violet-500",
    bgClass: "bg-violet-50",
    name: "Runway Score",
    body:
      "A 0–100 composite read of where the business stands — combining months of financial runway, pipeline coverage, expense discipline, and tax preparedness. Not a credit score, not a grade, not a verdict. A signal that estimates whether the things working agents normally watch separately are aligned this month, with a breakdown of which inputs moved.",
  },
  {
    icon: Calculator,
    iconClass: "text-amber-600",
    bgClass: "bg-amber-50",
    name: "Canadian tax estimator",
    body:
      "CRA federal brackets plus provincial brackets for every one of the 13 provinces and territories, refreshed each tax year. Adds self-employed CPP (no employer half), flags the $30,000 HST/GST small-supplier threshold, and indicates what quarterly instalments may approximate based on reported income. Public version is free — the in-app version reads your real numbers.",
    link: { href: "/tools/realtor-tax-estimator", label: "Try the free tax estimator" },
  },
  {
    icon: Tailfin,
    iconClass: "text-cyan-600",
    bgClass: "bg-cyan-50",
    name: "Flight Crew",
    body:
      "Three AI personas — Captain (orchestrator and overview), Navigator (tax and finance math), Dispatcher (clients and pipeline) — each with a defined lane, all answering against your real business data instead of generic templates. Tax conversations lock to information, not advice. Every action that writes to your data requires explicit human approval. You can talk to Captain right now, no account required.",
    link: { href: "/captain", label: "Talk to Captain" },
  },
];

// ─── "Built for Canada" rows ──────────────────────────────────────────────────

interface CanadaRow {
  icon: typeof MapIcon;
  iconClass: string;
  title: string;
  body: string;
}

const CANADA_ROWS: CanadaRow[] = [
  {
    icon: MapIcon,
    iconClass: "text-blue-500",
    title: "All 13 provinces and territories",
    body:
      "Combined federal + provincial marginal rates for British Columbia, Alberta, Saskatchewan, Manitoba, Ontario, Quebec (geo-blocked pending Law 25 + French), New Brunswick, Nova Scotia, Prince Edward Island, Newfoundland and Labrador, Yukon, Northwest Territories, and Nunavut. The rates reflect the brackets CRA and the provincial revenue agencies publish — not US assumptions retrofitted to Canada.",
  },
  {
    icon: Receipt,
    iconClass: "text-emerald-600",
    title: "T2125 line-by-line",
    body:
      "Self-employed Canadian agents file T2125 (Statement of Business Activities). The expense model maps to T2125 lines: advertising, meals (50%), office, supplies, professional fees, insurance, vehicle (mileage and CCA), home-office. The reports surface what your accountant will likely want to see, formatted the way the form expects.",
  },
  {
    icon: FileText,
    iconClass: "text-violet-600",
    title: "HST / GST $30,000 threshold tracking",
    body:
      "Once worldwide taxable revenue from your last four consecutive calendar quarters crosses $30,000, you are no longer a small supplier. The threshold trigger is flagged in the dashboard, with the date the engine estimates you may have crossed it from your reported numbers — surfaced as information for you and your accountant, not as a filing instruction.",
  },
  {
    icon: Building2,
    iconClass: "text-amber-600",
    title: "PREC awareness",
    body:
      "Personal Real Estate Corporations are permitted in several provinces — Ontario, BC, Alberta, Saskatchewan, Manitoba, Nova Scotia, and others as legislation evolves. Agent Runway tracks whether PREC may be relevant to your numbers (sole-prop vs corporate paths estimate differently at CRA scale), and surfaces the inflection point as information for an accountant conversation.",
  },
  {
    icon: Clock,
    iconClass: "text-cyan-600",
    title: "Quarterly instalment math",
    body:
      "Self-employed agents earning above the threshold pay quarterly instalments — March 15, June 15, September 15, December 15. The engine estimates what each instalment may approximate from reported income, and indicates the date a payment may be expected. Whether to use the prior-year option, current-year estimate, or no-calculation method is a conversation with your accountant — not something AR tells you to do.",
  },
  {
    icon: Shield,
    iconClass: "text-blue-600",
    title: "PIPEDA + Law 25 posture",
    body:
      "Canadian privacy law applies to Canadian businesses. AR is built on a PIPEDA-aligned data model with Law 25 work in progress — Quebec stays geo-blocked until French translation and Law 25 documentation are complete. Data residency and lawful-basis questions get answered against Canadian rules, not US ones.",
  },
];

// ─── What AR is NOT ───────────────────────────────────────────────────────────

const NOT_DOING: { title: string; body: string }[] = [
  {
    title: "We do not connect to MLS or syndicate listings.",
    body: "Your brokerage system, your local board, and your listing portals already do this. AR reads the financial side of what those systems produce.",
  },
  {
    title: "We do not replace your accountant.",
    body: "Your accountant signs the return, handles CRA correspondence, and knows the specifics of your situation. AR surfaces estimates and patterns that may help that conversation — your accountant remains the person who files.",
  },
  {
    title: "We do not currently integrate with QuickBooks.",
    body: "AR's financial data lives in its own ledger model. A QuickBooks bridge is not on the near-term roadmap. If your bookkeeper runs QuickBooks, AR runs alongside as the agent-facing read layer.",
  },
  {
    title: "We do not replace your CRM.",
    body: "Top Canadian agents run a specialized CRM — Follow Up Boss, kvCORE, LionDesk, HubSpot, Lofty. Keep yours. AR sits alongside it as the financial layer, not underneath it as a partial replacement. The Dispatcher persona reads your AR client records; it does not try to be your primary CRM of record.",
  },
  {
    title: "We do not auto-send marketing email or SMS.",
    body: "CASL is real. Drafts are fine; auto-blast is not. The Flight Crew can draft a newsletter, listing description, social post, or per-client outreach — but every send goes out through you, with your review.",
  },
  {
    title: "We do not give tax advice.",
    body: "Every tax surface — estimator, dashboard cards, Navigator chats, blog posts — is locked to information from published CRA rules and engine-computed estimates from your reported data. We never tell you how to file, when to file, or what to do strategically. That is your accountant's role.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CanadianFinancialLayerPillar() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PAGE_SCHEMA) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(CLUSTER_COLLECTION) }}
      />

      <MarketingNav />

      <main>
        {/* ── Section 1: Hero ── */}
        <section className="relative overflow-hidden bg-slate-950 px-6 py-20 sm:px-10 sm:py-28">
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-[120px]"
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <Layers className="h-3.5 w-3.5" />
              The Canadian Financial Layer
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Built for the way Canadian agents actually get paid.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Agent Runway is the business financial layer top Canadian real
              estate agents run alongside their CRM. CRA-aware tax estimates,
              HST tracking, T2125 reconciliation, runway in months, and a
              Flight Crew that reads your real numbers — not US assumptions
              retrofitted to Canada.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-500">
              All 13 provinces and territories. PIPEDA-aligned. Built in Saint
              John, New Brunswick, by an agent who needed it to exist.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/captain"
                className="inline-flex items-center rounded-lg bg-blue-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <Tailfin className="mr-2 h-4 w-4" />
                Talk to Captain
              </Link>
              <Link
                href="/tools/realtor-tax-estimator"
                className="inline-flex items-center rounded-lg border border-slate-700 px-7 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Try the free tax estimator
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Section 2: Why Canadian-specific matters ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <span className="mb-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Why a Canadian-specific layer
            </span>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Most software built for &ldquo;real estate agents&rdquo; is
              built for Americans.
            </h2>
            <div className="mt-6 space-y-5 text-base leading-relaxed text-slate-700">
              <p>
                Walk through the back end of almost any popular real estate
                CRM, brokerage suite, or agent productivity tool, and you find
                the same thing: schedules sized for US 1099 reporting,
                quarterly tax assumptions written for IRS deadlines, expense
                templates that map to Schedule C, and revenue forecasts that
                ignore the Canadian seasonality every Atlantic and Prairie
                agent feels in their bones. The tools work fine for the
                category they were built for. They were not built for the way
                a self-employed Canadian agent actually gets paid.
              </p>
              <p>
                A Canadian agent files T2125, not Schedule C. Pays CPP on the
                full self-employed amount with no employer half, not
                self-employment Social Security. Crosses an HST/GST
                small-supplier threshold at $30,000 in worldwide taxable
                revenue, not a state-by-state economic-nexus rule. Pays
                quarterly instalments on March 15, June 15, September 15, and
                December 15 — different cadence, different math, different
                penalty structure. Operates in a province whose marginal
                bracket may stack federally to a top combined rate north of 50
                percent, depending on income level and the year. Considers
                whether to incorporate as a Personal Real Estate Corporation
                under provincial legislation that varies meaningfully between
                Ontario, BC, Alberta, Saskatchewan, Manitoba, Nova Scotia, and
                the rest. None of that translates from US assumptions.
              </p>
              <p>
                The category-level observation that &ldquo;agents want one
                business operating system&rdquo; is industry-wide. The
                Canadian-specific observation is that the financial half of
                that operating system needs to be Canadian from the schema up
                — not a US product with a province dropdown bolted on.
              </p>
              <p>
                Agent Runway is built for the Canadian half. It does not try
                to be your CRM of record, your MLS, your transaction-management
                system, or your accountant. It is the financial layer those
                systems leave open: the year-round read of where the business
                actually stands, in numbers that match the form your
                accountant will eventually file.
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 3: The five capabilities ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 max-w-3xl">
              <span className="mb-3 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                What the layer does
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Five capabilities that compose the layer.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Each one is built around a Canadian-specific reality. Each one
                connects to the others — your tax number depends on your
                income, your runway depends on your forecast, your forecast
                depends on your pipeline. The Flight Crew reads all of it.
              </p>
            </div>

            <div className="space-y-6">
              {CAPABILITIES.map((cap) => {
                const Icon = cap.icon;
                return (
                  <div
                    key={cap.name}
                    className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-8"
                  >
                    <div className="mb-4 flex items-center gap-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl ${cap.bgClass}`}
                      >
                        <Icon className={`h-6 w-6 ${cap.iconClass}`} />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-900">
                        {cap.name}
                      </h3>
                    </div>
                    <p className="text-base leading-relaxed text-slate-600">
                      {cap.body}
                    </p>
                    {cap.link && (
                      <Link
                        href={cap.link.href}
                        className="mt-4 inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {cap.link.label}
                        <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Section 4: Built for Canada ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 max-w-3xl">
              <span className="mb-3 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Built for Canada
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                What &ldquo;Canadian financial depth&rdquo; means in
                practice.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Six concrete pieces of Canadian-specific work that do not
                exist in a US-built product, and would not be cheap to bolt
                on after the fact.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {CANADA_ROWS.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.title}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${row.iconClass}`} />
                      <h3 className="text-base font-semibold text-slate-900">
                        {row.title}
                      </h3>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600">
                      {row.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Section 5: What AR is NOT ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <div className="mb-10">
              <span className="mb-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                What this is not
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Honest about the lane.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                A financial layer that tries to be every tool ends up being
                none of them. Here is what Agent Runway does not try to
                replace, and why.
              </p>
            </div>

            <div className="space-y-4">
              {NOT_DOING.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6"
                >
                  <div className="mb-2 flex items-start gap-3">
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                    <h3 className="text-base font-semibold text-slate-900">
                      {item.title}
                    </h3>
                  </div>
                  <p className="pl-8 text-sm leading-relaxed text-slate-600">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-10 rounded-2xl border border-blue-200 bg-blue-50 p-6 text-sm leading-relaxed text-blue-900">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                What this is, then
              </div>
              <p className="text-blue-900/90">
                The financial layer that sits alongside your CRM, brokerage
                tools, and accountant — and answers the year-round questions
                they leave open. Designed to be the part of a top Canadian
                agent&apos;s stack that reads what is actually happening to
                the numbers, in the language CRA uses.
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 6: Founder narrative (short, links out) ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <span className="mb-3 inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
              Why this exists
            </span>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              An agent built it because no one else was going to.
            </h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-700">
              <p>
                Agent Runway was started by Andrew Shaw — a working REALTOR®
                on the Ellis Team at Royal LePage Atlantic in Saint John, New
                Brunswick. The short version: after a separation reset his
                financial picture, he needed a clear-eyed read of his own
                business. Not a CRM. Not a marketing platform. A way to know,
                month by month, what he had really earned, what CRA would
                eventually want, and how long the runway was if the next deal
                was slower to close than expected.
              </p>
              <p>
                That tool did not exist for Canadian agents in any form he
                could use. The US-built options assumed an IRS calendar and
                Schedule C. The accounting-package options assumed a
                bookkeeper. The Canadian agent tools that did exist were
                client-tracking systems with revenue counters bolted on, not
                financial systems with a CRM layer. So he built the financial
                system — first for himself, then for the team around him,
                then for any Canadian agent who recognised the same gap.
              </p>
              <p>
                <Link
                  href="/"
                  className="font-medium text-blue-600 underline-offset-2 hover:underline"
                >
                  Read the longer version on the homepage
                </Link>{" "}
                or{" "}
                <Link
                  href="/about/andrew-shaw"
                  className="font-medium text-blue-600 underline-offset-2 hover:underline"
                >
                  meet the founder
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 7: Flight Crew advantage ── */}
        <section className="bg-slate-50 px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-4xl">
            <div className="mb-10 max-w-3xl">
              <span className="mb-3 inline-block rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
                The crew
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Three personas. Defined lanes. Real data.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Not one chatbot answering everything badly. Three personas
                with explicit ownership of distinct domains, and explicit
                handoffs between them when a question crosses the border.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Tailfin,
                  iconClass: "text-blue-600",
                  bgClass: "bg-blue-50",
                  name: "Captain",
                  body: "Strategic overview. Connects your tax, pipeline, and clients into one read of where the business stands. Default responder; routes to Navigator or Dispatcher when a question is theirs.",
                },
                {
                  icon: Compass,
                  iconClass: "text-cyan-600",
                  bgClass: "bg-cyan-50",
                  name: "Navigator",
                  body: "Tax and finance math. CRA rate tables, instalment estimates, HST flagging, year-end forecasts. Locked to information, not advice — every tax conversation surfaces estimates and rules, never filing instructions.",
                },
                {
                  icon: Radio,
                  iconClass: "text-violet-600",
                  bgClass: "bg-violet-50",
                  name: "Dispatcher",
                  body: "Clients and pipeline. Reads your CRM records, drafts per-client outreach, surfaces who is going cold, and suggests Flight Plan templates tied to where each deal sits in your funnel.",
                },
              ].map((persona) => {
                const Icon = persona.icon;
                return (
                  <div
                    key={persona.name}
                    className="rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-lg ${persona.bgClass}`}
                      >
                        <Icon className={`h-5 w-5 ${persona.iconClass}`} />
                      </div>
                      <div className="text-base font-semibold text-slate-900">
                        {persona.name}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600">
                      {persona.body}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/captain"
                className="inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <Tailfin className="mr-2 h-4 w-4" />
                Talk to Captain — no account required
              </Link>
            </div>
          </div>
        </section>

        {/* ── Section 8: Content cluster — Going deeper ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 max-w-3xl">
              <span className="mb-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Going deeper
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Long-form coverage of the Canadian agent finance questions.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Each article below is locked to information from published
                CRA rules. None of them tell you what to do. Read what
                applies; bring it to your accountant.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {[
                {
                  href: "/tools/realtor-tax-estimator",
                  icon: Calculator,
                  title: "Free Canadian Realtor Tax Estimator",
                  desc: "Federal + provincial + CPP for all 13 provinces and territories.",
                  badge: "Tool",
                },
                {
                  href: "/first-year-tax-filing-real-estate-agents-canada",
                  icon: Compass,
                  title: "First-Year Tax Filing for Newly-Licensed Canadian Agents",
                  desc: "Licence day to first T1 — T2125, the $30K HST threshold, April 30 / June 15, CPP, and year-one mistakes.",
                  badge: "CRA-cited",
                },
                {
                  href: "/real-estate-agent-tools-canada",
                  icon: Layers,
                  title:
                    "What's Missing Between Your Accountant, CRM, and Spreadsheet",
                  desc: "Where the default Canadian agent stack leaves a year-round gap.",
                  badge: "Comparison",
                },
                {
                  href: "/real-estate-agent-hst-registration-canada",
                  icon: FileText,
                  title: "HST/GST Registration for Canadian Real Estate Agents",
                  desc: "$30K threshold, ITCs, provincial rates, filing frequency.",
                  badge: "CRA-cited",
                },
                {
                  href: "/t2125-guide-real-estate-agents-canada",
                  icon: Receipt,
                  title: "T2125 Guide for Real Estate Agents",
                  desc: "Statement of Business Activities, line by line.",
                  badge: "CRA-cited",
                },
                {
                  href: "/prec-vs-sole-proprietor-real-estate-agents-canada",
                  icon: Building2,
                  title: "PREC vs Sole Proprietor in Canada",
                  desc: "Personal Real Estate Corporation considerations versus sole-prop.",
                  badge: "CRA-cited",
                },
                {
                  href: "/real-estate-agent-tax-instalments-canada",
                  icon: Clock,
                  title: "Real Estate Agent Tax Instalments in Canada",
                  desc: "How CRA quarterly instalments work for self-employed agents.",
                  badge: "CRA-cited",
                },
                {
                  href: "/real-estate-agent-tax-rates-nb-ns-pei",
                  icon: MapIcon,
                  title: "NB / NS / PEI Tax Rates for Real Estate Agents",
                  desc: "Combined federal + provincial marginal rates for Atlantic agents.",
                  badge: "CRA-cited",
                },
                {
                  href: "/self-employed-cpp-real-estate-agents-canada",
                  icon: BookOpen,
                  title: "CPP for Self-Employed Real Estate Agents",
                  desc: "How CPP works when there is no employer half.",
                  badge: "CRA-cited",
                },
                {
                  href: "/real-estate-agent-business-expenses-canada",
                  icon: Receipt,
                  title: "Real Estate Agent Business Expenses in Canada",
                  desc: "What is deductible on T2125 — and what is not.",
                  badge: "CRA-cited",
                },
                {
                  href: "/vehicle-expenses-real-estate-agents-canada",
                  icon: MapIcon,
                  title: "Vehicle Expenses for Real Estate Agents in Canada",
                  desc: "Logbook, CCA caps, and the 90% GST/HST ITC threshold.",
                  badge: "CRA-cited",
                },
                {
                  href: "/business-use-of-home-real-estate-agents-canada",
                  icon: Home,
                  title: "Business-Use-of-Home Expenses for Real Estate Agents",
                  desc: "T2125 Line 9945, qualifying tests, and the principal-residence CCA trap.",
                  badge: "CRA-cited",
                },
                {
                  href: "/gst-hst-quick-method-real-estate-agents-canada",
                  icon: Percent,
                  title: "GST/HST Quick Method for Canadian Real Estate Agents",
                  desc: "$400K ceiling, service-provider rates by province, the 1% credit, and the ITC trade-off.",
                  badge: "CRA-cited",
                },
                {
                  href: "/real-estate-tax-deadlines-canada",
                  icon: Clock,
                  title: "Real Estate Tax Deadlines in Canada",
                  desc: "April, June, instalment quarters, HST filing.",
                  badge: "CRA-cited",
                },
                {
                  href: "/real-estate-agent-tax-planning-canada",
                  icon: Sparkles,
                  title: "Real Estate Agent Tax Planning Canada",
                  desc: "Year-round considerations for Canadian agents.",
                  badge: "CRA-cited",
                },
                {
                  href: "/how-much-should-real-estate-agents-save-for-taxes-canada",
                  icon: Calculator,
                  title: "How Much to Save for Taxes (Canada)",
                  desc: "What CRA rates indicate for Canadian agent earnings.",
                  badge: "CRA-cited",
                },
                {
                  href: "/capital-gains-real-estate-agents-canada",
                  icon: TrendingUp,
                  title: "Capital Gains Tax for Agents Who Invest Personally",
                  desc: "Flip-vs-hold, the PRE, the 365-day anti-flipping rule, section 45 elections, CCA recapture, the QSBC LCGE, and the 50% inclusion rate.",
                  badge: "CRA-cited",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-600">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {item.badge}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-700">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                      {item.desc}
                    </p>
                    <span className="mt-3 inline-flex items-center text-sm font-semibold text-blue-600">
                      Read more
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Section 9: Pricing nudge + CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Add the Canadian financial layer to your stack.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Keep your CRM. Keep your accountant. Add the layer that reads
              your numbers in the language CRA uses, and answers the
              questions your other tools leave open.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500">
              Charter pricing for the first 50 users, locked for as long as
              your subscription stays active. Founding pricing for the next
              50. After that, regular pricing applies.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                See pricing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/captain"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                <Tailfin className="mr-2 h-4 w-4" />
                Talk to Captain
              </Link>
            </div>
            <p className="mx-auto mt-8 max-w-xl text-xs leading-relaxed text-slate-600">
              Tax content on this page surfaces published CRA rules and
              engine-computed estimates from reported data. It is information,
              not filing advice. Decisions about how and when to file remain
              between you and your accountant.
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
