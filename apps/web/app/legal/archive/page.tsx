import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { POLICY_VERSIONS, POLICY_LABELS, POLICY_PATHS, POLICY_TYPES } from "@/lib/policy-versions";

export const metadata: Metadata = {
  title: "Policy Archive",
  description: "Historical versions of Agent Runway's published policies, maintained for transparency and regulator-evidence purposes.",
  alternates: { canonical: "https://agentrunway.ca/legal/archive" },
  robots: { index: false, follow: false },
};

/* -------------------------------------------------------------------------- */
/* Archived policy versions                                                   */
/* -------------------------------------------------------------------------- */
/* Each time a policy is materially updated, the prior version's content is   */
/* preserved in git history (commit-by-commit). When a user-facing snapshot   */
/* is needed for a specific version date, add a corresponding entry below     */
/* with a link to the snapshot route at /legal/archive/{policy}/{date}.       */
/*                                                                            */
/* For versions older than the table below, the prior text is available on    */
/* request — see the contact note at the bottom of this page.                 */
/* -------------------------------------------------------------------------- */

interface ArchivedVersion {
  version: string;       // YYYY-MM-DD
  status:  "current" | "archived";
  notes:   string;       // brief change summary
  href?:   string;       // archive snapshot URL (omit for "current")
}

const VERSION_HISTORY: Record<keyof typeof POLICY_VERSIONS, ArchivedVersion[]> = {
  terms: [
    { version: POLICY_VERSIONS.terms, status: "current", notes: "Cox & Palmer track-changes; sole prop → Inc. carry-over; Canada-only language; security-incident clause; carve-out tightening; CREA section reserved." },
    { version: "2026-04-16",         status: "archived", notes: "Sole proprietorship → Agent Runway Inc. transition." },
  ],
  privacy: [
    { version: POLICY_VERSIONS.privacy, status: "current", notes: "Cox & Palmer track-changes; OPC abbreviation; Bill C-27 paragraph removed; financial-data-sharing reworded; CREA section reserved." },
    { version: "2026-04-16",            status: "archived", notes: "Sole proprietorship → Agent Runway Inc. transition." },
  ],
  acceptable_use: [
    { version: POLICY_VERSIONS.acceptable_use, status: "current", notes: "Canada-only language; sensitive-info clarified; date bump." },
    { version: "2026-03-22",                    status: "archived", notes: "Initial published version." },
  ],
  cookie: [
    { version: POLICY_VERSIONS.cookie, status: "current", notes: "Capitalized-terms note added; date bump." },
    { version: "2026-03-23",            status: "archived", notes: "Initial published version." },
  ],
};

export default function PolicyArchivePage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <MarketingNav />

      <main className="flex-1 px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Policy Archive
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              Historical versions of our published policies.
            </p>
            <p className="mt-5 text-base leading-relaxed text-slate-400">
              Each time we materially update a policy, the prior version is
              preserved so you can verify what was in effect on any given date.
              The current published version of each policy is also linked
              below for convenience. If you need the full text of an older
              version that is not yet snapshotted on a public route, contact{" "}
              <a href="mailto:privacy@agentrunway.ca" className="text-blue-400 underline hover:text-blue-300">
                privacy@agentrunway.ca
              </a>{" "}
              and we will provide it within 30 days at no cost.
            </p>
          </div>

          {/* Per-policy version tables */}
          <div className="space-y-12 text-slate-300">
            {POLICY_TYPES.map((policy) => {
              const versions = VERSION_HISTORY[policy] ?? [];
              return (
                <section key={policy}>
                  <h2 className="mb-4 text-xl font-semibold text-white">
                    {POLICY_LABELS[policy]}
                  </h2>
                  <p className="mb-4 text-sm text-slate-400">
                    Live current version:{" "}
                    <Link href={POLICY_PATHS[policy]} className="text-blue-400 underline hover:text-blue-300">
                      {POLICY_PATHS[policy]}
                    </Link>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-left text-xs uppercase tracking-wider text-slate-500">
                          <th className="px-4 py-2.5 font-medium">Version</th>
                          <th className="px-4 py-2.5 font-medium">Status</th>
                          <th className="px-4 py-2.5 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {versions.map((v) => (
                          <tr key={v.version} className="border-b border-slate-800/50 last:border-b-0">
                            <td className="px-4 py-3 font-mono text-xs text-slate-300">{v.version}</td>
                            <td className="px-4 py-3">
                              <span
                                className={
                                  v.status === "current"
                                    ? "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 border border-emerald-500/30"
                                    : "inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border border-slate-700"
                                }
                              >
                                {v.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs leading-relaxed text-slate-400">
                              {v.notes}
                              {v.href && (
                                <>
                                  {" — "}
                                  <Link href={v.href} className="text-blue-400 underline hover:text-blue-300">
                                    view snapshot
                                  </Link>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="mt-12 rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-sm leading-relaxed text-slate-400">
            <p>
              <strong className="text-slate-200">How we keep version history:</strong>{" "}
              Every published change to a policy creates a new commit in our
              source repository. The &ldquo;Last updated&rdquo; date on each
              live policy page matches the current version listed above. If
              you accepted a policy at an earlier version, the version you
              accepted is recorded in our internal acceptance log and is
              available to you on request.
            </p>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
