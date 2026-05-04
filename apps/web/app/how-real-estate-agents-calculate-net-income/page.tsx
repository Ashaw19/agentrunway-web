import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { articleSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = {
  title: "How Real Estate Agents Calculate Net Income",
  description:
    "Learn how to calculate net income as a real estate agent — from GCI through commission splits, brokerage fees, expenses, and tax obligations.",
  openGraph: {
    url: "https://agentrunway.ca/how-real-estate-agents-calculate-net-income",
    images: [{ url: "/og-image-v2.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical:
      "https://agentrunway.ca/how-real-estate-agents-calculate-net-income",
  },
};

const pageArticleSchema = articleSchema({
  headline: "How Real Estate Agents Calculate Net Income",
  description:
    "A step-by-step guide for Canadian real estate agents on how to calculate true net income from GCI — accounting for commission splits, brokerage fees, business expenses, and tax obligations.",
  url: "/how-real-estate-agents-calculate-net-income",
  datePublished: "2025-11-01",
  dateModified: "2026-04-16",
  imageUrl: "/og-image-v2.png",
});

const breadcrumb = breadcrumbSchema([
  { name: "Home", url: "/" },
  { name: "How Agents Calculate Net Income", url: "/how-real-estate-agents-calculate-net-income" },
]);

// ── Table of contents entries ─────────────────────────────────────────────────

const TOC = [
  { href: "#what-is-net-income", label: "What is net income for a real estate agent?" },
  { href: "#step-by-step-calculation", label: "The net income calculation step by step" },
  { href: "#common-mistakes", label: "Why most agents overestimate their net income" },
  { href: "#how-agent-runway-helps", label: "How Agent Runway calculates net income automatically" },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HowRealEstateAgentsCalculateNetIncomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">

      {/* ── JSON-LD (Article + BreadcrumbList) ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageArticleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />

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
              How Real Estate Agents Calculate Net Income
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Gross Commission Income is the number most agents celebrate — but it&apos;s
              not the number that pays your mortgage. This guide walks through exactly
              how to go from GCI to actual real estate agent net income, with a concrete
              Canadian example and the common mistakes that cause agents to overestimate
              what they actually keep.
            </p>
            <p className="mt-3 text-xs text-slate-500">7 min read</p>
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

              {/* ── Section 1: What Is Net Income ── */}
              <h2 id="what-is-net-income">
                What Is Net Income for a Real Estate Agent?
              </h2>

              <p>
                For a real estate agent, net income is the amount of money that remains
                after every deduction has been applied to your Gross Commission Income
                (GCI). It is the number that actually lands in your personal bank account
                — or stays in your business — after your brokerage takes its cut, your
                operating costs are paid, and the Canada Revenue Agency gets its share.
              </p>

              <p>
                GCI is your top-line revenue. It represents the total commission dollars
                earned from completed transactions before anything is deducted. A $900,000
                sale at a 2.5% commission rate produces $22,500 in GCI. That figure is
                real and meaningful as a performance metric — but it bears almost no
                resemblance to what you will actually take home.
              </p>

              <p>
                The full net income formula for a Canadian real estate agent looks like this:
              </p>

              <ul>
                <li>
                  <strong>GCI</strong> — total commission earned across all closed
                  transactions for the period
                </li>
                <li>
                  <strong>Less: brokerage commission split</strong> — the percentage
                  your brokerage retains (commonly 20–30% of GCI, though structures vary
                  widely)
                </li>
                <li>
                  <strong>Less: transaction fees</strong> — per-deal fees charged by
                  your brokerage, often $200–$600 per transaction or more
                </li>
                <li>
                  <strong>Less: monthly desk or franchise fees</strong> — recurring fixed
                  charges that continue regardless of deal volume
                </li>
                <li>
                  <strong>Less: business expenses</strong> — MLS fees, E&O insurance,
                  marketing, technology, vehicle, professional development, and all other
                  operating costs
                </li>
                <li>
                  <strong>Less: income tax</strong> — federal plus provincial tax on your
                  net self-employment income, plus CPP contributions
                </li>
                <li>
                  <strong>= Real estate agent net income</strong>
                </li>
              </ul>

              <p>
                Each step in that formula can meaningfully reduce your take-home pay.
                An agent with $200,000 in GCI might realistically net somewhere between
                $65,000 and $90,000 depending on their brokerage structure, expense
                discipline, province of residence, and how proactively they manage their
                tax obligations. The gap between the headline GCI number and the net
                reality is almost always larger than agents expect.
              </p>

              <h3>Why the distinction matters</h3>

              <p>
                The GCI-versus-net-income gap has practical consequences for every
                financial decision an agent makes. Setting an annual income goal based on
                GCI alone means you will routinely fall short of what you actually need to
                earn. Making lifestyle spending decisions based on commission deposits —
                before accounting for taxes owed — is how agents end up with CRA payment
                problems. And benchmarking your performance against other agents using
                GCI figures without understanding their net positions gives you a
                misleading picture of relative success.
              </p>

              <p>
                Understanding net income is not just an accounting exercise. It is the
                foundation of sound financial planning for any self-employed professional,
                and real estate agents — who often have lumpy, seasonal, and highly
                variable income — need this clarity more than most.
              </p>

              {/* ── Section 2: Step-by-Step Calculation ── */}
              <h2 id="step-by-step-calculation">
                The Net Income Calculation Step by Step
              </h2>

              <p>
                A concrete example makes the math tangible. Consider a Canadian real
                estate agent in Ontario who closes $200,000 in GCI over the course of
                a calendar year. Here is how that number flows through to actual net income.
              </p>

              <h3>Step 1: Apply the brokerage commission split</h3>

              <p>
                On a standard 70/30 split, the agent retains 70% of GCI and the brokerage
                keeps 30%.
              </p>

              <ul>
                <li>GCI: $200,000</li>
                <li>Brokerage share (30%): &minus;$60,000</li>
                <li><strong>Agent net commission: $140,000</strong></li>
              </ul>

              <p>
                Many brokerages cap this split after the agent reaches a certain annual
                GCI threshold — for example, switching to 90/10 after $100,000 in GCI.
                If that cap applies, the retained amount would be higher. For simplicity,
                a flat 70/30 split is used here.
              </p>

              <h3>Step 2: Deduct transaction and brokerage fees</h3>

              <p>
                Most brokerages charge a per-transaction fee in addition to the
                commission split. At an average of $400 per transaction on 20 closed
                deals per year, the total is $8,000.
              </p>

              <ul>
                <li>Agent net commission: $140,000</li>
                <li>Transaction fees (20 deals × $400): &minus;$8,000</li>
                <li><strong>After fees: $132,000</strong></li>
              </ul>

              <h3>Step 3: Subtract annual business expenses</h3>

              <p>
                A well-run real estate practice incurs significant operating costs. A
                reasonable annual expense total for an agent at this income level might
                include MLS and board fees, E&O insurance premiums, marketing and
                advertising spend, technology subscriptions, a portion of vehicle costs,
                and professional development. A combined total of $22,000 is realistic
                and, in many cases, conservative.
              </p>

              <ul>
                <li>After fees: $132,000</li>
                <li>Annual business expenses: &minus;$22,000</li>
                <li><strong>Net business income before tax: $110,000</strong></li>
              </ul>

              <h3>Step 4: Estimate federal and provincial income tax plus CPP</h3>

              <p>
                A self-employed agent in Ontario with $110,000 in net business income
                faces a meaningful combined tax obligation. Federal and Ontario provincial
                income tax on this amount — after the basic personal amount and other
                standard deductions — runs approximately $28,000–$32,000 depending on
                filing specifics. CPP contributions at the self-employed rate add a further
                $6,000–$7,000 (self-employed agents pay both the employee and employer
                share). A combined tax and CPP estimate of $35,000 is a reasonable
                planning figure.
              </p>

              <ul>
                <li>Net business income before tax: $110,000</li>
                <li>Estimated federal + provincial tax + CPP: &minus;$35,000</li>
                <li><strong>Approximate net income: $75,000</strong></li>
              </ul>

              <p>
                From $200,000 in GCI, the actual take-home figure in this scenario is
                approximately $75,000 — just 37.5% of the headline number. This is not
                unusual. Many Canadian real estate agents are surprised to discover how
                far the real net figure sits below their GCI.
              </p>

              <h3>How brokerage structure changes the outcome</h3>

              <p>
                The example above uses a 70/30 split with per-transaction fees. An agent
                on a different model — a 100% commission model with a higher monthly desk
                fee, or a graduated split that reaches 90/10 after a threshold — will
                arrive at a different net figure even on identical GCI. The split
                structure is often the single largest variable in the calculation, which
                is why understanding your specific arrangement is essential before
                projecting any income figure.
              </p>

              {/* ── Section 3: Common Mistakes ── */}
              <h2 id="common-mistakes">
                Why Most Agents Overestimate Their Net Income
              </h2>

              <p>
                Most real estate agents have an intuitive sense that their GCI is not
                their take-home pay — but most also systematically overestimate how much
                they actually net. There are three specific patterns that cause this.
              </p>

              <h3>Mistake 1: Treating GCI as income</h3>

              <p>
                The most common mistake is the most fundamental: conflating the GCI
                figure with actual income. When an agent closes a deal and receives a
                commission cheque — or sees a deposit that reflects their post-split
                amount — it is tempting to think of that as earnings. But the business
                expenses still outstanding, and the tax liability that just grew, are
                not visible in that moment. An agent who closes a $15,000 commission
                cheque in October and spends freely through November may discover in
                February that the tax bill consumes a third of what felt like a strong
                close to the year.
              </p>

              <p>
                The discipline required is to immediately discount every commission
                received by a realistic estimate of the effective tax and expense rate.
                Until that mental accounting is automatic, agents will consistently
                overestimate how much they can spend.
              </p>

              <h3>Mistake 2: Forgetting that quarterly instalments accumulate</h3>

              <p>
                Self-employed Canadians who expect to owe more than $3,000 in tax for
                a given year are required by the CRA to pay in quarterly instalments —
                in March, June, September, and December. A full breakdown of how these
                work is covered in the guide to{" "}
                <Link href="/real-estate-agent-tax-planning-canada">
                  real estate agent tax planning in Canada
                </Link>
                . Agents who do not set money
                aside throughout the year find themselves in a compounding bind: not
                only do they owe a large amount at tax time, but they may also have
                missed instalment payments and face interest charges on top.
              </p>

              <p>
                The agents who handle this best treat each commission deposit as
                partially belonging to the CRA before they receive it. Setting aside
                30–35% of every payment into a dedicated tax account — untouchable
                until instalment dates — eliminates year-end surprises entirely.
              </p>

              <h3>Mistake 3: Not tracking expenses throughout the year</h3>

              <p>
                Business expenses reduce taxable income, which in turn reduces the tax
                owed. But agents who fail to track expenses through the year have no
                running estimate of what their actual net business income is. They close
                the year not knowing whether their expense ratio is lean or bloated,
                whether there are deductible costs they have missed claiming, or whether
                their net income projections are realistic.
              </p>

              <p>
                Expense tracking is not just a bookkeeping task — it is a real-time
                input into every income projection, tax estimate, and financial decision
                an agent makes throughout the year. Without it, the net income
                calculation at the end of the year is a reconstruction from incomplete
                records rather than an ongoing awareness.
              </p>

              {/* ── Section 4: How Agent Runway Helps ── */}
              <h2 id="how-agent-runway-helps">
                How Agent Runway Calculates Net Income Automatically
              </h2>

              <p>
                <Link href="/">Agent Runway</Link> was designed specifically for the
                net income calculation problem. Rather than tracking GCI and leaving the
                rest to a spreadsheet or an end-of-year accountant visit, Agent Runway
                processes every transaction through the full deduction chain automatically
                — giving you a live, up-to-date net income estimate at every point in the year.
              </p>

              <h3>Your brokerage split and fees, applied to every deal</h3>

              <p>
                When you set up Agent Runway, you configure your specific brokerage
                commission split percentage, per-transaction fee, and any recurring
                monthly charges. Every deal you log is immediately processed through
                those parameters. The platform shows your net agent commission — after
                the split and transaction fees — alongside the raw GCI figure, so you
                always know the distinction between the two.
              </p>

              <h3>Business expenses tracked by category</h3>

              <p>
                Agent Runway includes a pre-built expense tracking system with categories
                tailored to real estate agents: MLS and board fees, E&O insurance,
                marketing and advertising, technology, vehicle, home office, professional
                development, and more. Every expense you log reduces your net business
                income in real time, so the platform&apos;s projections and tax estimates
                stay accurate throughout the year — not just at filing time.
              </p>

              <h3>Federal and provincial tax estimates using Canadian rate tables</h3>

              <p>
                Agent Runway&apos;s built-in tax engine calculates your estimated federal
                income tax, provincial income tax for your province, and CPP contributions
                (or QPP if you are in Quebec) using current Canadian rate tables. It shows
                your estimated quarterly instalment amount, the per-deal tax set-aside
                that keeps you on track, and your projected effective tax rate — all
                updated automatically as your income and expenses change through the year.
              </p>

              <p>
                The result is a live, accurate estimate of your real estate agent net
                income that reflects your actual brokerage structure, your tracked
                expenses, and your provincial tax position — not a rough approximation.
                For a full picture of what the{" "}
                <Link href="/real-estate-business-analytics">
                  Agent Runway business analytics dashboard
                </Link>{" "}
                covers, including forecasting and financial runway, explore the platform
                overview. Agents switching from spreadsheets can also read the{" "}
                <Link href="/real-estate-analytics-vs-spreadsheets">
                  comparison of real estate analytics software vs. spreadsheets
                </Link>
                .
              </p>

            </article>

          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="bg-slate-950 px-6 py-24 text-center sm:px-10">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Start tracking your true net income — not just your GCI.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Agent Runway applies your brokerage split, deducts your tracked expenses,
              and estimates your Canadian tax obligation automatically. See the real
              number — live, every day of the year.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Get Started Free
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
