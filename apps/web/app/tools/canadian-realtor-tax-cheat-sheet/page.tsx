import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Calculator,
  Mail,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { EmailCapture } from "@/components/email-capture";
import { articleSchema, breadcrumbSchema } from "@/lib/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_URL =
  "https://agentrunway.ca/tools/canadian-realtor-tax-cheat-sheet";

export const metadata: Metadata = {
  title:
    "Canadian Realtor Tax Cheat Sheet 2025 — Free One-Page PDF | Agent Runway",
  description:
    "A free one-page PDF reference card for self-employed Canadian real estate agents. 2025 federal + provincial brackets, CPP1/CPP2 figures, GST/HST, 2026 deadlines, T2125 categories. Every figure cited to the CRA.",
  keywords: [
    "canadian realtor tax cheat sheet",
    "real estate agent tax checklist canada",
    "self employed realtor tax one pager",
    "canadian realtor tax reference 2025",
    "realtor tax pdf canada",
  ],
  openGraph: {
    type: "article",
    url: PAGE_URL,
    title:
      "Canadian Realtor Tax Cheat Sheet 2025 — Free One-Page PDF",
    description:
      "A printable one-page reference card. 2025 federal + provincial brackets, self-employed CPP, GST/HST, 2026 deadlines, T2125 — every figure cited to the CRA.",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Canadian Realtor Tax Cheat Sheet 2025",
    description:
      "A free one-page PDF reference card for Canadian real estate agents. CRA-cited.",
  },
  alternates: {
    canonical: PAGE_URL,
  },
};

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

const JSON_LD_ARTICLE = articleSchema({
  headline:
    "Canadian Realtor Tax Cheat Sheet 2025 — Free One-Page PDF",
  description:
    "A printable one-page reference card for self-employed Canadian real estate agents. 2025 federal + provincial brackets, CPP1/CPP2, GST/HST, 2026 deadlines, T2125 categories — every figure cited to the CRA.",
  url: "/tools/canadian-realtor-tax-cheat-sheet",
  datePublished: "2026-05-06",
  dateModified: "2026-05-06",
});

const JSON_LD_BREADCRUMB = breadcrumbSchema([
  { name: "Home", url: "https://agentrunway.ca" },
  { name: "Tools", url: "https://agentrunway.ca/tools" },
  {
    name: "Canadian Realtor Tax Cheat Sheet",
    url: PAGE_URL,
  },
]);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheatSheetPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_ARTICLE) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(JSON_LD_BREADCRUMB),
        }}
      />

      <MarketingNav />

      <main>
        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <FileText className="h-3.5 w-3.5" />
              Free PDF · 2025 tax year · CRA-cited
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              The Canadian Realtor Tax Cheat Sheet
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              One page. Every figure cited to the CRA. Print it, pin it,
              hand it to your accountant. Built for self-employed Canadian
              real estate agents.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              2025 tax year · For agents outside Quebec
            </p>
          </div>
        </section>

        {/* ── Email gate ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-2xl">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 sm:px-10 sm:py-12">
              <EmailCapture
                heading="Get the cheat sheet"
                subheading="We&rsquo;ll email you the PDF. Unsubscribe anytime. Your email is never shared."
                ctaLabel="Email me the cheat sheet"
                source="cheat_sheet_landing"
                variant="light"
                successHeading="Check your inbox."
                successSubtext="The cheat sheet is on its way. If it doesn&rsquo;t arrive within a few minutes, check your spam folder."
                successCtaLabel="Try the live tax estimator"
                successCtaHref="/tools/realtor-tax-estimator"
                successSecondaryLabel="Read the tax planning guide"
                successSecondaryHref="/real-estate-agent-tax-planning-canada"
              />
            </div>
          </div>
        </section>

        {/* ── What's on the card ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              What&rsquo;s on the card
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              A single dense page covering the figures self-employed
              realtors look up most often during a tax year.
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "2025 federal tax brackets (5 rows)",
                "Top provincial bracket per province + territory",
                "Self-employed CPP1 + CPP2 — basic exemption, YMPE, YAMPE, max contributions",
                "GST/HST — $30,000 small-supplier threshold + provincial rates",
                "2026 key deadlines — T1, instalments (Mar/Jun/Sep/Dec), HST quarterly, T4A",
                "T2125 expense categories at a glance",
                "Top 10 categories realtors commonly deduct",
                "Footer with the canonical CRA disclaimer + estimator link",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-sm leading-relaxed text-slate-700"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Who it's for ── */}
        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              Who it&rsquo;s for
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Self-employed real estate agents in Canada (excluding Quebec,
              which operates its own provincial system administered by
              Revenu Qu&eacute;bec). The card is information, not advice
              &mdash; verify with your accountant before any filing
              decision.
            </p>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Every numeric claim on the card is sourced to a primary CRA
              URL printed on the artifact itself. No tax-prep blog
              citations. No third-party paraphrasing.
            </p>
          </div>
        </section>

        {/* ── Want your own numbers? ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              Want to run your own numbers?
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              The cheat sheet shows the published figures. The live
              estimator applies them to your own commission income.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/tools/realtor-tax-estimator"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <Calculator className="mr-2 h-4 w-4" />
                Try the free tax estimator
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/real-estate-agent-tax-planning-canada"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Read the tax planning guide
              </Link>
            </div>
          </div>
        </section>

        {/* ── Disclaimer ── */}
        <section className="bg-slate-50 px-6 py-12 sm:px-10">
          <div className="mx-auto max-w-2xl">
            <p className="text-center text-xs leading-relaxed text-slate-500">
              The cheat sheet surfaces published CRA rules and 2025 figures.
              It is general information, not financial, tax, or
              professional advice. Federal and provincial rates change with
              budgets &mdash; confirm current values at canada.ca before
              relying on them. Always consult a qualified accountant or tax
              professional for your own situation.{" "}
              <Link
                href="/terms"
                className="underline underline-offset-2 hover:text-slate-700"
              >
                Terms of Service
              </Link>
              .
            </p>
          </div>
        </section>

        {/* ── Built by AR ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Built by Agent Runway.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              The financial layer Canadian real estate agents run alongside
              their CRM. Tax estimates that update as deals close. CPP, HST,
              and instalments tracked from a single dashboard. CRA-cited
              throughout.
            </p>
            <div className="mt-8 inline-flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get started free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/"
                className="text-sm font-semibold text-slate-400 underline underline-offset-4 hover:text-slate-200"
              >
                Learn more about Agent Runway
              </Link>
            </div>
            <p className="mx-auto mt-8 inline-flex items-center gap-2 text-xs text-slate-500">
              <Mail className="h-3.5 w-3.5" />
              Already submitted? The PDF is in your inbox &mdash; check
              spam if it didn&rsquo;t arrive.
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
