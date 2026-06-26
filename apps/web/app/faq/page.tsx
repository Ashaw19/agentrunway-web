import type { Metadata } from "next";
import Link from "next/link";
import {
  CreditCard,
  BarChart3,
  ShieldCheck,
  AlertTriangle,
  Rocket,
  ChevronRight,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about Agent Runway — pricing, features, data privacy, and the accuracy of tax estimates and income projections.",
  openGraph: {
    url: "https://agentrunway.ca/faq",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/faq",
  },
};

// ── FAQ data ──────────────────────────────────────────────────────────────────

const FAQ_SECTIONS = [
  {
    id: "billing",
    icon: CreditCard,
    title: "Billing & Plans",
    color: "blue",
    faqs: [
      {
        q: "Is there a free trial for the Professional plan?",
        a: "Yes. The Professional plan includes a 14-day free trial with no credit card required. You can explore every Pro feature — Runway Score, tax estimates, AI Business Assistant, probability bands, and industry benchmarks — before committing.",
      },
      {
        q: "What's included in the Professional plan?",
        a: "Professional gives you the full platform: GCI tracking, CRM with flight statuses, probability-weighted forecasts (P10–P90), a six-component Runway Score, per-deal and quarterly tax estimates, AI business assistant, receipt scanning, mileage tracking, industry benchmark comparisons, and PDF-ready reports — everything serious agents need to run their business with clarity.",
      },
      {
        q: "Can I cancel at any time?",
        a: "Absolutely. There are no long-term contracts or cancellation fees. Cancel from your account settings at any time and your access continues through the end of your current billing period. No partial refunds are issued for unused time.",
      },
      {
        q: "How does billing work?",
        a: "The Professional plan is billed monthly in Canadian dollars (CAD). You can upgrade, downgrade, or cancel at any time from your account settings. We reserve the right to change pricing with 30 days' notice to active subscribers.",
      },
      {
        q: "Is there a refund policy?",
        a: "We do not issue partial refunds for unused portions of a billing period. If you cancel, your access continues until the end of the period you've already paid for. If you believe you were charged in error, contact us at hello@agentrunway.ca within 7 days.",
      },
    ],
  },
  {
    id: "features",
    icon: BarChart3,
    title: "Features & How It Works",
    color: "violet",
    faqs: [
      {
        q: "Who is Agent Runway designed for?",
        a: "Agent Runway is built specifically for Canadian real estate agents — from solo agents building their first business plan to high-producing agents who want deep financial analytics, tax estimation tools, and AI-powered insights.",
      },
      {
        q: "Which provinces and territories are supported?",
        a: "All 13 Canadian provinces and territories are supported for tax calculations, including federal and provincial income tax rates, CPP contributions, and Quebec QPP. You select your province during onboarding and can update it in Settings at any time.",
      },
      {
        q: "What is a Runway Score?",
        a: "Your Runway Score is a composite letter grade (A+ through F) that summarises the overall financial health of your real estate business across five components: Goal Pace (35%), Pipeline (30%), Expenses (15%), Survival (15%), and Benchmark (5%). It updates automatically as you log transactions, deals, and expenses.",
      },
      {
        q: "What are P10–P90 probability bands?",
        a: "Rather than showing a single year-end forecast, Agent Runway shows a range. P10 is a conservative outcome (only 10% of scenarios are worse), P90 is an optimistic one (only 10% of scenarios are better). This gives you a realistic picture of the range of outcomes rather than a false sense of precision.",
      },
      {
        q: "Can I import my existing transaction history?",
        a: "Yes. Agent Runway supports importing from Excel career trackers (single or multi-year), annual MLS/board PDF reports, and image files. The import wizard detects column layouts automatically, handles common date formats, and lets you review all deals before saving. You can also add years manually.",
      },
      {
        q: "Does Agent Runway work on mobile?",
        a: "Agent Runway is a responsive web application that works on mobile browsers. There is currently no native iOS or Android app. The dashboard, pipeline, and transaction entry pages all work well on phones and tablets.",
      },
    ],
  },
  {
    id: "data",
    icon: ShieldCheck,
    title: "Data, Privacy & Security",
    color: "green",
    faqs: [
      {
        q: "Where is my data stored?",
        a: "Your data is stored in Canada via Supabase (Canada Central region). We do not transfer your personal or business data to servers outside Canada for primary storage. All connections are encrypted in transit using TLS.",
      },
      {
        q: "Is my data secure?",
        a: "Yes. All data is encrypted in transit (TLS) and at rest. Row-level security (RLS) policies in our database ensure that each user can only access their own data. We never share your individual data with third parties. See our Privacy Policy for full details.",
      },
      {
        q: "Can I export my data?",
        a: "Your data belongs to you. You can view and download your transaction history and reports from within the app. If you need a full data export for any reason, contact us at hello@agentrunway.ca and we will provide it.",
      },
      {
        q: "What happens to my data if I cancel?",
        a: "If you cancel your subscription, your data remains accessible through the end of your billing period. After that, your account moves to a read-only state. If you delete your account entirely, your data is permanently removed from our servers within 30 days. We do not retain deleted account data.",
      },
      {
        q: "Does Agent Runway share my data with anyone?",
        a: "We do not sell or share your personal or business data with third parties. We use Supabase for database hosting and may use anonymised, aggregated data (never individual) for platform improvements. Full details are in our Privacy Policy.",
      },
    ],
  },
  {
    id: "accuracy",
    icon: AlertTriangle,
    title: "Accuracy, Estimates & Legal",
    color: "amber",
    faqs: [
      {
        q: "How accurate are the tax estimates?",
        a: "Tax estimates in Agent Runway are approximations based on publicly available federal and provincial tax rates and CPP/QPP thresholds. They are calculated using the income you enter and your selected province. They do not account for deductions you may be entitled to, credits, carry-forwards, prior-year adjustments, or other factors specific to your situation. Your actual CRA tax obligation will differ. Always work with a qualified accountant or tax professional for your actual tax filings.",
      },
      {
        q: "How accurate are income projections and forecasts?",
        a: "Projections in Agent Runway are illustrative estimates based on your year-to-date performance, pipeline, and historical seasonality patterns. They are not predictions or guarantees. Actual results will vary based on market conditions, deal timing, personal circumstances, and factors outside the app's model. Projections are intended for planning and goal-setting purposes only — not for use in financial applications, loan underwriting, or any other binding context.",
      },
      {
        q: "Can I use Agent Runway outputs to file my taxes or apply for a mortgage?",
        a: "No. Agent Runway outputs — including tax estimates, income projections, GCI figures, and net income calculations — are for internal planning and self-management purposes only. They are not verified, audited, or certified financial statements. Do not submit them as evidence of income to the CRA, a mortgage lender, a financial institution, or any other third party. Always use professionally prepared financial statements from a licensed accountant for official purposes.",
      },
      {
        q: "Is the Flight Crew giving me financial advice?",
        a: "No. The AI chat assistant and insight cards in Agent Runway generate contextual observations and suggestions based on your data. This content is informational only and does not constitute financial advice, tax advice, investment advice, or professional accounting services. AI outputs may be inaccurate or incomplete. Do not make consequential financial decisions based solely on AI-generated content. Always consult a qualified professional.",
      },
      {
        q: "What if the tax rates in the app are out of date?",
        a: "We update our tax rate tables when federal or provincial budgets change rates. However, we cannot guarantee that rates are current at all times. Tax law changes frequently, and rates effective at the time of calculation may differ from those in force when you file. Always verify rates with CRA or a qualified tax professional before making financial decisions.",
      },
    ],
  },
  {
    id: "start",
    icon: Rocket,
    title: "Getting Started",
    color: "blue",
    faqs: [
      {
        q: "How do I set up my account?",
        a: "After signing up, a short onboarding wizard walks you through selecting your province, entering your brokerage commission split, and setting your annual GCI goal. The whole process takes under two minutes. You can update any of these settings later from the Settings page.",
      },
      {
        q: "What file formats can I import?",
        a: "Agent Runway accepts Excel workbooks (.xlsx, .xls), PDF annual reports from your real estate board or MLS, and image files (.jpg, .png, .webp) of handwritten or scanned summaries. Excel is the most reliable format for multi-year career trackers.",
      },
      {
        q: "Do I need to enter all my historical data?",
        a: "No. Agent Runway works with whatever you have. Even a single year of history gives the app enough data to generate a Runway Score and seasonality-adjusted forecast. The more years you add, the more accurate your seasonal profile becomes — but the app is fully functional with just current-year data.",
      },
      {
        q: "Is there a setup guide or tutorial?",
        a: "The onboarding wizard covers the essentials. If you need help beyond that, our GCI Tracking Guide explains the key concepts, and you can always email us at hello@agentrunway.ca — we're a small team and we respond personally.",
      },
    ],
  },
] as const;

// ── JSON-LD ───────────────────────────────────────────────────────────────────

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_SECTIONS.flatMap(({ faqs }) =>
    faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  ),
};

const FAQ_BREADCRUMB = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "FAQ",  url: "/faq" },
]);

// ── Color map ─────────────────────────────────────────────────────────────────

const COLOR = {
  blue:   { badge: "border-blue-500/30 bg-blue-500/10 text-blue-400", icon: "bg-blue-500/10 text-blue-400" },
  violet: { badge: "border-violet-500/30 bg-violet-500/10 text-violet-400", icon: "bg-violet-500/10 text-violet-400" },
  green:  { badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", icon: "bg-emerald-500/10 text-emerald-400" },
  amber:  { badge: "border-amber-500/30 bg-amber-500/10 text-amber-400", icon: "bg-amber-500/10 text-amber-400" },
} as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FAQPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_BREADCRUMB) }}
      />

      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-2xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              Help Centre
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Frequently Asked Questions
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Everything you need to know about Agent Runway — from billing and features
              to how we handle your data and what our estimates actually mean.
            </p>
          </div>
        </section>

        {/* ── Jump links ── */}
        <section className="border-y border-slate-800 bg-slate-900/50 px-6 py-5 sm:px-10">
          <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-3">
            {FAQ_SECTIONS.map(({ id, icon: Icon, title, color }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${COLOR[color].badge}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {title}
              </a>
            ))}
          </div>
        </section>

        {/* ── FAQ sections ── */}
        <section className="bg-white px-6 py-20 sm:px-10">
          <div className="mx-auto max-w-4xl space-y-20">
            {FAQ_SECTIONS.map(({ id, icon: Icon, title, color, faqs }) => (
              <div key={id} id={id}>

                {/* Section header */}
                <div className="mb-10 flex items-center gap-3">
                  <div className={`inline-flex items-center justify-center rounded-xl p-2.5 ${COLOR[color].icon}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                    {title}
                  </h2>
                </div>

                {/* Q&A items */}
                <div className="space-y-4">
                  {faqs.map(({ q, a }) => (
                    <details
                      key={q}
                      className="group rounded-xl border border-slate-200 bg-slate-50 open:bg-white open:shadow-sm"
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-6 py-5">
                        <span className="text-sm font-semibold text-slate-900 leading-snug">
                          {q}
                        </span>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                      </summary>
                      <div className="border-t border-slate-100 px-6 py-5">
                        <p className="text-sm leading-relaxed text-slate-600">{a}</p>
                      </div>
                    </details>
                  ))}
                </div>

              </div>
            ))}
          </div>
        </section>

        {/* ── Legal callout ── */}
        <section className="bg-amber-50 px-6 py-14 sm:px-10">
          <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
            <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-amber-500" />
            <h2 className="mb-2 text-lg font-bold text-slate-900">
              Important: Estimates are for planning only
            </h2>
            <p className="mx-auto max-w-xl text-sm leading-relaxed text-slate-600">
              All tax estimates, income projections, and financial calculations in Agent Runway
              are approximations for self-management purposes only. They are not audited, verified,
              or certified. Do not use them for tax filings, mortgage applications, or any official
              purpose. Always consult a qualified accountant or tax professional.{" "}
              <Link href="/terms" className="font-semibold text-amber-600 underline-offset-2 hover:underline">
                Read our full Terms of Service
              </Link>
              .
            </p>
          </div>
        </section>

        {/* ── Still have questions CTA ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Still have questions?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-400">
              We&apos;re a small team and we read every email. Usually respond within one
              business day.
            </p>
            <a
              href="mailto:hello@agentrunway.ca"
              className="mt-8 inline-flex items-center rounded-lg bg-blue-600 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Email us at hello@agentrunway.ca
            </a>
          </div>
        </section>

      </main>

      <MarketingFooter />
    </div>
  );
}
