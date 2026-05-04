import { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";

export const metadata: Metadata = {
  title: "Not Yet Available in Quebec",
  robots: { index: false, follow: false },
};

export default function QuebecPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#010D1F" }}>
      <MarketingNav />

      <main className="flex-1">
        {/* ── Hero Section ──────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden px-6 pb-20 pt-28 sm:pt-36">
          {/* Animated gradient orbs */}
          <div className="orb-drift-1 absolute -left-20 -top-20 h-96 w-96 rounded-full bg-blue-600/25 blur-[120px]" />
          <div className="orb-drift-2 absolute -right-20 top-10 h-80 w-80 rounded-full bg-violet-600/20 blur-[100px]" />
          <div className="orb-drift-3 absolute bottom-0 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[90px]" />

          <div className="relative mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold text-amber-400">
              Coming Soon to Quebec
            </div>

            {/* Heading */}
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Pas encore disponible{" "}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #93c5fd 0%, #60a5fa 30%, #a78bfa 70%, #c084fc 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                au Québec
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
              Agent Runway is not currently offered in the province of Quebec.
              We&apos;re working to meet Quebec&apos;s regulatory and language
              requirements so we can serve agents there properly.
            </p>

            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-500">
              Agent Runway n&apos;est pas encore offert au Québec. Nous travaillons
              à satisfaire les exigences réglementaires et linguistiques du Québec
              afin de pouvoir servir adéquatement les courtiers de cette province.
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/waitlist"
                className="rounded-xl px-8 py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.02]"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  boxShadow: "0 0 30px rgba(99,102,241,0.35)",
                }}
              >
                Join the Waitlist
              </Link>
              <Link
                href="/quebec/bypass"
                className="rounded-lg border border-slate-700 px-8 py-3 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800"
              >
                I&apos;m not from Quebec
              </Link>
            </div>
          </div>
        </section>

        {/* ── What We're Building ──────────────────────────────────── */}
        <section className="relative border-t border-white/5 px-6 py-20">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-4 text-center text-3xl font-extrabold text-white sm:text-4xl">
              What we&apos;re working on
            </h2>
            <p className="mx-auto mb-14 max-w-lg text-center text-slate-400">
              Quebec has unique regulatory requirements. Here&apos;s what we&apos;re building to ensure full compliance before we launch.
            </p>

            <div className="grid gap-6 sm:grid-cols-2">
              {/* Card 1 */}
              <div className="rounded-2xl p-px" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.3) 0%, rgba(255,255,255,0.04) 100%)" }}>
                <div className="rounded-[15px] p-6" style={{ background: "#07101F" }}>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500" style={{ boxShadow: "0 0 20px rgba(59,130,246,0.4)" }}>
                    <span className="text-lg">🇫🇷</span>
                  </div>
                  <h3 className="mb-2 text-base font-bold text-white">French Canadian Translation</h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    Complete bilingual interface including all features, dashboards, AI responses, and onboarding — in Québécois French.
                  </p>
                </div>
              </div>

              {/* Card 2 */}
              <div className="rounded-2xl p-px" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(255,255,255,0.04) 100%)" }}>
                <div className="rounded-[15px] p-6" style={{ background: "#07101F" }}>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500" style={{ boxShadow: "0 0 20px rgba(168,85,247,0.4)" }}>
                    <span className="text-lg">🔒</span>
                  </div>
                  <h3 className="mb-2 text-base font-bold text-white">Law 25 Privacy Compliance</h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    Privacy Impact Assessments, enhanced consent mechanisms, and data portability rights required by Quebec&apos;s privacy legislation.
                  </p>
                </div>
              </div>

              {/* Card 3 */}
              <div className="rounded-2xl p-px" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.3) 0%, rgba(255,255,255,0.04) 100%)" }}>
                <div className="rounded-[15px] p-6" style={{ background: "#07101F" }}>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500" style={{ boxShadow: "0 0 20px rgba(16,185,129,0.4)" }}>
                    <span className="text-lg">📊</span>
                  </div>
                  <h3 className="mb-2 text-base font-bold text-white">QPP &amp; QST Tax Support</h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    Quebec Pension Plan rates, Quebec Sales Tax calculations, and provincial abatement — fully integrated into estimates and reports.
                  </p>
                </div>
              </div>

              {/* Card 4 */}
              <div className="rounded-2xl p-px" style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.3) 0%, rgba(255,255,255,0.04) 100%)" }}>
                <div className="rounded-[15px] p-6" style={{ background: "#07101F" }}>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500" style={{ boxShadow: "0 0 20px rgba(245,158,11,0.4)" }}>
                    <span className="text-lg">📜</span>
                  </div>
                  <h3 className="mb-2 text-base font-bold text-white">French Legal Documents</h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    Terms of service, privacy policy, and all legal disclosures translated and adapted for Quebec&apos;s Consumer Protection Act.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ───────────────────────────────────────────── */}
        <section className="relative border-t border-white/5 px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-2xl font-extrabold text-white sm:text-3xl">
              Get notified when we launch
            </h2>
            <p className="mb-8 text-slate-400">
              Join the waitlist and we&apos;ll let you know the moment Agent Runway is available for Quebec real estate agents.
            </p>
            <Link
              href="/waitlist"
              className="inline-flex rounded-xl px-8 py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                boxShadow: "0 0 30px rgba(99,102,241,0.35)",
              }}
            >
              Join the Waitlist
            </Link>
            <p className="mt-6 text-xs text-slate-500">
              Visiting from another province?{" "}
              <Link
                href="/quebec/bypass"
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
              >
                Continue to the site
              </Link>
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
