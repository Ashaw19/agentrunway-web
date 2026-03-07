import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "How Real Estate Agents Track GCI | Agent Runway",
  description:
    "Learn how top real estate agents track gross commission income (GCI), forecast annual income, and measure business performance.",
  openGraph: {
    url: "https://agentrunway.ca/how-real-estate-agents-track-gci",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://agentrunway.ca/how-real-estate-agents-track-gci",
  },
};

// ── Table of contents entries ─────────────────────────────────────────────────

const TOC = [
  { href: "#what-is-gci", label: "What is GCI?" },
  { href: "#why-agents-track-gci-incorrectly", label: "Why most agents track GCI incorrectly" },
  { href: "#how-top-agents-track-gci", label: "How top agents track GCI" },
  { href: "#how-agent-runway-helps", label: "How Agent Runway helps" },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HowRealEstateAgentsTrackGCIPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── Navigation ── */}
      <MarketingNav />

      <main>

        {/* ── Hero ── */}
        <section className="bg-slate-950 px-6 py-20 text-center sm:px-10 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-400">
              <BookOpen className="h-3.5 w-3.5" />
              Guide for Canadian Real Estate Agents
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              How Real Estate Agents Track GCI
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Gross Commission Income is the single most important number in a real estate
              agent&apos;s business — yet most agents track it poorly, forecast it never,
              and only see the real picture at tax time. This guide covers what GCI actually
              means, where common tracking methods fall short, and how top-performing agents
              manage it with discipline.
            </p>
            <p className="mt-3 text-xs text-slate-500">6 min read</p>
          </div>
        </section>

        {/* ── Article Body ── */}
        <section className="bg-white px-6 py-16 sm:px-10">
          <div className="mx-auto max-w-3xl">

            {/* Table of Contents */}
            <nav
              aria-label="Table of contents"
              className="mb-12 rounded-xl border border-slate-200 bg-slate-50 p-6"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                In this article
              </p>
              <ol className="space-y-2">
                {TOC.map(({ href, label }, i) => (
                  <li key={href} className="flex items-baseline gap-2 text-sm">
                    <span className="font-mono text-xs text-slate-400">{i + 1}.</span>
                    <a
                      href={href}
                      className="text-blue-600 underline-offset-2 hover:underline"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <article className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:text-slate-900 prose-h3:text-lg prose-h3:text-slate-800 prose-p:leading-relaxed prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-slate-800">

              {/* ── Section 1: What is GCI ── */}
              <h2 id="what-is-gci">What is GCI?</h2>

              <p>
                Gross Commission Income (GCI) is the total commission earned from real estate
                transactions before any deductions are applied. When a home sells for $800,000
                and the total commission rate is 3.5%, the gross commission is $28,000. That
                $28,000 — before your brokerage split, transaction fees, or any other cost —
                is your GCI contribution from that deal.
              </p>

              <p>
                GCI is the top-line revenue number for a real estate agent&apos;s business.
                It sits at the same level as gross revenue for any other self-employed
                professional. Everything meaningful about your business — your income trajectory,
                your tax obligations, your benchmarks against peers — flows downstream from it.
              </p>

              <p>
                Because real estate agents are typically independent contractors rather than
                salaried employees, GCI is also variable and lumpy. A strong March and a slow
                August can both be part of the same good year. Understanding GCI therefore
                requires more than a running total — it requires context, pacing, and projection.
              </p>

              <h3>GCI versus net agent income</h3>

              <p>
                One of the most important distinctions agents must understand is the difference
                between GCI and actual take-home income. From your GCI, the following are
                typically deducted before you see a dollar:
              </p>

              <ul>
                <li>
                  <strong>Brokerage commission split</strong> — commonly 70/30, 80/20, or a
                  graduated structure, meaning your brokerage keeps 20–30 cents of every
                  dollar you earn.
                </li>
                <li>
                  <strong>Transaction fees</strong> — a per-deal fee charged by many brokerages,
                  often ranging from $200 to $600 or more, sometimes capped annually.
                </li>
                <li>
                  <strong>Monthly brokerage desk fees</strong> — a recurring fixed cost that
                  continues whether you close deals or not.
                </li>
                <li>
                  <strong>Business expenses</strong> — marketing, MLS fees, E&O insurance,
                  technology subscriptions, vehicle costs, and more.
                </li>
              </ul>

              <p>
                A $200,000 GCI year does not mean $200,000 in the bank. After a 20% brokerage
                split, transaction fees, a monthly desk fee, and business expenses, the real
                net figure might be closer to $130,000 — before income tax and CPP contributions.
                Tracking GCI alone, without understanding what flows through to net, is one of
                the most common financial blind spots in the industry.
              </p>

              {/* ── Section 2: Why agents track GCI incorrectly ── */}
              <h2 id="why-agents-track-gci-incorrectly">
                Why most agents track GCI incorrectly
              </h2>

              <p>
                Ask ten real estate agents how they track their GCI and you&apos;ll hear a
                familiar range of answers: a spreadsheet, their CRM&apos;s commission field,
                a rough mental tally, or &quot;my accountant handles it.&quot; Each of these
                approaches has serious gaps.
              </p>

              <h3>The spreadsheet trap</h3>

              <p>
                Spreadsheets are the most popular tracking method among self-employed agents.
                They&apos;re free, flexible, and familiar. The problem is that a spreadsheet
                only reflects what you enter into it — and most agents update it infrequently,
                inconsistently, or not at all during busy stretches. A spreadsheet also has no
                understanding of time. It can tell you your cumulative GCI, but it cannot tell
                you whether that number is ahead of or behind where you should be in week 32
                of a 52-week year.
              </p>

              <h3>CRM commission totals</h3>

              <p>
                Many agents use a CRM to manage their pipeline and track closed transactions.
                Most CRMs include a commission or deal-value field, and some offer basic
                reporting. But CRM commission tracking is typically a static total — it doesn&apos;t
                apply your split, doesn&apos;t deduct fees, doesn&apos;t factor in seasonality,
                and doesn&apos;t project forward. You&apos;re left with a raw number that
                requires a separate calculation to become meaningful.
              </p>

              <h3>No forecasting built in</h3>

              <p>
                Perhaps the most costly gap in typical GCI tracking is the absence of forward
                projection. Knowing you&apos;ve earned $95,000 GCI by August is useful —
                but knowing whether that pace implies a $165,000 year or a $135,000 year is
                far more actionable. Most tracking methods answer the historical question and
                leave the forward question unanswered.
              </p>

              <p>
                Real estate income is seasonal. Transactions cluster in spring and fall in
                most Canadian markets, and slow through December and January. A simple
                straight-line projection from August will overestimate full-year income if
                the remaining months are historically slower. Without seasonality adjustments,
                naive projections routinely mislead.
              </p>

              <h3>No visibility into expenses</h3>

              <p>
                GCI tracking that ignores the expense side of the business produces a
                dangerously incomplete picture. An agent who closes $180,000 in GCI but runs
                $60,000 in business expenses — and owes $35,000 in taxes — has a fundamentally
                different financial position than one who closed $150,000 with $20,000 in
                expenses and optimal tax planning. Without expense tracking wired into the
                same system as GCI tracking, the full picture never materialises.
              </p>

              {/* ── Section 3: How top agents track GCI ── */}
              <h2 id="how-top-agents-track-gci">How top agents track GCI</h2>

              <p>
                High-producing agents — particularly those running their practice as a
                deliberate business rather than a series of transactions — tend to monitor a
                richer set of metrics. GCI is the starting point, not the endpoint.
              </p>

              <h3>Monthly pace against goal</h3>

              <p>
                Rather than watching a cumulative total, disciplined agents track their monthly
                pace: how much GCI they need to close each month to hit their annual goal,
                adjusted for which months historically produce more volume. If your goal is
                $200,000 GCI and you&apos;re in a market where Q2 represents 30% of annual
                transactions, closing $15,000 in January is actually ahead of the adjusted pace
                — even though it represents only 7.5% of your annual target.
              </p>

              <h3>Pipeline forecasting with weighted probability</h3>

              <p>
                Closed deals represent certainty; active pipeline represents probability. Top
                agents apply close probabilities to their in-progress deals — a listing with
                an accepted offer and firm conditions removed is near 100%, while a buyer
                showing interest in a property might be 20–30%. Weighting pipeline by
                probability and adding it to year-to-date GCI gives a much sharper year-end
                estimate than closed deals alone.
              </p>

              <h3>Annual projections with confidence bands</h3>

              <p>
                Rather than committing to a single year-end number, the most rigorous agents
                think probabilistically. A base-case projection reflects current pace. A
                conservative case accounts for a slow Q4. An optimistic case factors in one or
                two additional deals. Layering in variance — often called P10 through P90
                bands, borrowed from financial modelling — turns a forecast into a range of
                realistic outcomes rather than a single guess.
              </p>

              <h3>Net versus gross income at every stage</h3>

              <p>
                Tracking net agent income — not just GCI — means applying your specific
                brokerage split, transaction fee structure, desk fees, and known business
                expenses at every stage. When you receive a commission cheque, the net-to-you
                figure should be calculable immediately, not discovered at tax time.
              </p>

              <h3>Financial runway as a business metric</h3>

              <p>
                The agents least vulnerable to market slowdowns are those who monitor their
                cash runway: the number of months their reserves cover their fixed operating
                costs. This single number — how long you can sustain your business without a
                single new commission — determines how much risk you can afford to take, how
                aggressively you can invest in marketing, and whether you&apos;re building a
                resilient business or living deal-to-deal.
              </p>

              {/* ── Section 4: How Agent Runway helps ── */}
              <h2 id="how-agent-runway-helps">How Agent Runway helps</h2>

              <p>
                <Link href="/">Agent Runway</Link>{" "}
                was built to close the gap between how most agents track GCI
                today and how the best agents manage their business. It replaces manual
                spreadsheets, disconnected CRM fields, and end-of-year accounting surprises
                with a{" "}
                <Link href="/real-estate-business-analytics">
                  live business dashboard
                </Link>
                {" "}purpose-built for Canadian real estate agents.
              </p>

              <h3>Automatic GCI tracking with split and fee calculations</h3>

              <p>
                Every transaction you log in Agent Runway is immediately processed through
                your specific commission split, transaction fee rate, monthly brokerage fee
                allocation, and business expenses. The platform shows your net agent income —
                not just gross GCI — from the moment a deal is entered. Year-to-date figures,
                average deal size, buyer versus seller split, and pace against your annual
                goal are all calculated automatically and updated in real time.
              </p>

              <h3>Seasonality-aware income forecasting</h3>

              <p>
                Agent Runway&apos;s projection engine applies Canadian real estate seasonality
                curves to your year-to-date performance and probability-weighted pipeline.
                Rather than a naive straight-line projection, the forecast understands that
                March and October close more deals than January and July in most markets. The
                result is a year-end estimate that reflects realistic market patterns, not
                just arithmetic extrapolation.
              </p>

              <h3>P10–P90 probability bands</h3>

              <p>
                Every forecast in Agent Runway is expressed as a range, not a single number.
                The P10 band represents a conservative outcome; P90 represents an optimistic
                one. You can see at a glance whether your year-end income is likely to come
                in above or below your goal — and by how much — even when your pipeline is
                uncertain.
              </p>

              <h3>Financial runway measurement</h3>

              <p>
                Agent Runway calculates your financial runway in months using your current
                cash reserve and your total monthly fixed costs. It classifies your position
                as Critical, Warning, Healthy, or Strong, and updates automatically as your
                reserve and expenses change. A composite runway score across six financial
                dimensions gives you a single letter grade that summarises the overall health
                of your business.
              </p>

              <h3>Tax planning built in</h3>

              <p>
                For Canadian agents, tax planning is a year-round responsibility, not a
                February scramble. Agent Runway calculates your projected federal and
                provincial tax obligation using current rates for all 13 provinces and
                territories, including CPP and Quebec QPP contributions. It shows your
                recommended quarterly instalment amount and the per-deal amount to set aside
                so you never face a year-end surprise.
              </p>

              <h3>AI-powered business insights</h3>

              <p>
                Beyond the numbers, Agent Runway includes an AI chat assistant that has access
                to your live business data — your GCI pace, pipeline, expenses, runway, and
                projections. Ask it how you&apos;re tracking against your goal, what your
                biggest financial risk is right now, or how many deals you need to close in
                Q4 to hit your target. Contextual advisor cards surface the highest-impact
                observations automatically, ranked by their potential effect on your business
                outcomes.
              </p>

            </article>
          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Stop guessing. Start tracking GCI the right way.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway gives you the GCI tracking, income forecasting, and financial
              runway measurement that top agents use to run their business with clarity.
              Built specifically for Canadian real estate agents.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Try Agent Runway Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/real-estate-business-analytics"
                className="inline-flex items-center rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                See All Features
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <MarketingFooter />
    </div>
  );
}
