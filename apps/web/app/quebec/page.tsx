import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not Yet Available in Quebec | Agent Runway",
  robots: { index: false, follow: false },
};

export default function QuebecPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white px-6 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-lg text-center">
        {/* Logo / Brand */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Agent Runway
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Business Analytics for Canadian Real Estate Agents
          </p>
        </div>

        {/* Main Message */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 text-4xl">🏗️</div>
          <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-white">
            Not Yet Available in Quebec
          </h2>
          <p className="mb-4 text-slate-600 dark:text-slate-300">
            Agent Runway is not currently offered in the province of Quebec.
            We are working to meet Quebec&apos;s regulatory and language
            requirements so we can serve agents there properly.
          </p>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            Agent Runway n&apos;est pas encore offert au Québec. Nous travaillons
            à satisfaire les exigences réglementaires et linguistiques du Québec
            afin de pouvoir servir adéquatement les courtiers de cette province.
          </p>

          <hr className="my-6 border-slate-200 dark:border-slate-700" />

          {/* What's coming */}
          <div className="mb-6 text-left">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              What we&apos;re working on
            </h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-500">●</span>
                Full French Canadian translation
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-500">●</span>
                Quebec privacy law (Law 25) compliance
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-500">●</span>
                QPP and QST tax calculation support
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-blue-500">●</span>
                French-language legal documents and policies
              </li>
            </ul>
          </div>

          {/* CTA */}
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Want to be notified when we launch in Quebec?
          </p>
          <Link
            href="/waitlist"
            className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Join the Waitlist
          </Link>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
          If you believe you&apos;re seeing this page in error (e.g., you&apos;re
          visiting from another province), you can{" "}
          <Link
            href="/quebec/bypass"
            className="underline hover:text-slate-600 dark:hover:text-slate-300"
          >
            continue to the site
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
