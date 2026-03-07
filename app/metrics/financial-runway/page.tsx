import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Financial Runway for Real Estate Agents Explained | Agent Runway",
  description:
    "Learn what financial runway means for real estate agents, how to calculate it, and why it's the most important resilience metric for a commission-based business.",
  openGraph: {
    url: "https://agentrunway.ca/metrics/financial-runway",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/metrics/financial-runway",
  },
};

export default function FinancialRunwayMetricPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      <MarketingNav />

      <main>

        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <Link
              href="/real-estate-metrics"
              className="mb-5 inline-flex items-center rounded-full border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
            >
              ← Real Estate Metrics Library
            </Link>
            <div className="mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Financial Runway
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              How long your business can sustain itself without a single new
              commission — the most important resilience metric for any
              real estate agent.
            </p>
          </div>
        </section>

        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">
            <article className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:text-slate-900 prose-h3:text-lg prose-h3:text-slate-800 prose-p:leading-relaxed prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-slate-800">

              <h2>What is financial runway?</h2>
              <p>
                Financial runway is the number of months your current cash reserve
                covers your fixed monthly business costs — assuming zero new income.
                It is borrowed from startup finance, where it describes how long a
                company can operate before running out of money. For real estate
                agents, it answers a critical question: if I don&apos;t close a deal for
                the next several months, how long before I&apos;m in financial trouble?
              </p>
              <p>
                Unlike most metrics, financial runway is entirely forward-looking.
                It doesn&apos;t describe past performance — it describes current
                vulnerability. An agent with a high{" "}
                <Link href="/metrics/gci">GCI</Link> and a low runway is more
                exposed than an agent with moderate GCI and a strong reserve.
              </p>

              <h2>How to calculate financial runway</h2>
              <p>
                <strong>Financial Runway (months) = Cash Reserve ÷ Monthly Fixed Costs</strong>
              </p>
              <p>
                Monthly fixed costs should include all obligations that continue
                regardless of whether you close deals: desk fees, MLS and board
                fees, insurance premiums, technology subscriptions, vehicle
                payments allocated to the business, and any other recurring
                obligations.
              </p>

              <h3>Example</h3>
              <p>
                An agent maintains $24,000 in a dedicated business reserve account.
                Their monthly fixed costs — desk fee, MLS fee, E&O, CRM, and
                vehicle allocation — total $3,200 per month. Their financial
                runway is 7.5 months. Even if they closed no deals from today,
                they could cover their obligations for more than half a year.
              </p>

              <h2>Risk classification benchmarks</h2>
              <p>
                A practical way to classify runway is by months of coverage:
              </p>
              <ul>
                <li>
                  <strong>Less than 1 month — Critical:</strong> immediate exposure;
                  a deal falling through or a slow month creates a genuine financial
                  crisis
                </li>
                <li>
                  <strong>1–3 months — Warning:</strong> limited buffer; the business
                  is vulnerable to normal seasonal slowdowns
                </li>
                <li>
                  <strong>3–6 months — Healthy:</strong> adequate buffer for most
                  market cycles; the agent can weather a slow quarter without stress
                </li>
                <li>
                  <strong>6+ months — Strong:</strong> significant financial
                  resilience; the agent can pursue growth opportunities and take
                  calculated risks
                </li>
              </ul>

              <h2>Why real estate agents need to monitor runway specifically</h2>
              <p>
                Commission income is inherently lumpy and seasonal. Most Canadian
                markets see transaction volume peak in spring and fall and slow
                significantly in December and January. An agent earning $200,000
                per year may receive 60% of that income in just four months. If
                the remaining eight months of operating costs are not pre-funded,
                every slow stretch creates financial pressure.
              </p>
              <p>
                Agents with strong runway can make better business decisions:
                they can invest in marketing during slow periods, take time off
                without anxiety, and pursue higher-value listings that take longer
                to close — rather than chasing lower-priced deals simply to
                cover immediate costs.
              </p>

              <h2>How to improve your financial runway</h2>
              <p>
                Runway can be improved from either side of the formula: increase
                the cash reserve or reduce fixed monthly costs. In practice, the
                most sustainable approach is systematic reserve-building — setting
                aside a fixed percentage of each commission cheque into a dedicated
                business account before allocating income to personal use.
              </p>
              <p>
                Agent Runway&apos;s tax planning tools calculate a recommended
                per-deal set-aside amount for tax obligations. A similar approach
                applied to runway-building — setting aside, say, $500 per closed
                deal into a reserve — creates a reserve that grows in proportion
                to production volume.
              </p>

            </article>
          </div>
        </section>

        <section className="bg-slate-50 px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 sm:p-10">
            <h2 className="text-xl font-bold text-slate-900">
              How Agent Runway measures financial runway
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Agent Runway calculates your financial runway automatically from
              your declared cash reserve and your tracked monthly fixed costs.
              Your position is classified as Critical, Warning, Healthy, or Strong,
              and a composite runway score across six financial dimensions generates
              an overall letter grade (A+ to F) summarising your business&apos;s
              financial health. Both the runway month count and the composite score
              update in real time as your reserve and expenses change.
            </p>
          </div>
        </section>

        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Know your runway number in Agent Runway
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              See exactly how many months your reserve covers — and get a
              composite score that reflects your overall business resilience.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-7 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/real-estate-metrics"
                className="inline-flex items-center rounded-lg border border-slate-700 px-7 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Back to Metrics Library
              </Link>
            </div>
          </div>
        </section>

      </main>

      <MarketingFooter />
    </div>
  );
}
