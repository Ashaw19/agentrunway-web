import Link from "next/link";
import Image from "next/image";
import { CharterScarcityStrip } from "@/components/charter-scarcity-strip";

// ── Footer link columns ───────────────────────────────────────────────────────

const FOOTER_LINKS = {
  Product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Demo", href: "/demo" },
  ],
  Resources: [
    { label: "Blog", href: "/blog" },
    { label: "Metrics Library", href: "/real-estate-metrics" },
    { label: "GCI Tracking Guide", href: "/how-real-estate-agents-track-gci" },
    { label: "Real Estate Analytics", href: "/real-estate-business-analytics" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "FAQ", href: "/faq" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Security", href: "/security" },
    { label: "Cookie Policy", href: "/cookie-policy" },
    { label: "Sub-Processors", href: "/subprocessors" },
    { label: "Acceptable Use", href: "/acceptable-use" },
    { label: "AI Disclaimer", href: "/ai-disclaimer" },
  ],
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 px-6 py-16 sm:px-10">
      <div className="mx-auto max-w-6xl">

        {/* Top: brand + link columns */}
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">

          {/* Brand */}
          <div>
            <Link href="/" className="mb-4 flex items-center gap-2.5">
              <Image
                src="/logo.png"
                alt="Agent Runway"
                width={28}
                height={28}
                className="rounded-lg"
              />
              <span className="text-base font-bold tracking-tight text-white">
                Agent Runway
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-slate-400">
              Business analytics for Canadian real estate agents. Track GCI,
              forecast income, and measure financial runway.
            </p>
          </div>

          {/* Link columns */}
          {(Object.keys(FOOTER_LINKS) as Array<keyof typeof FOOTER_LINKS>).map(
            (section) => (
              <div key={section}>
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {section}
                </h3>
                <ul className="space-y-3">
                  {FOOTER_LINKS[section].map(({ label, href }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="text-sm text-slate-400 transition-colors hover:text-white"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>

        {/* Charter scarcity strip — auto-hides after seat 50 */}
        <div className="mt-12 flex justify-center border-t border-slate-800 pt-8">
          <CharterScarcityStrip variant="compact" />
        </div>

        {/* Bottom bar */}
        <div className="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex flex-col items-center gap-1 sm:items-start">
            <p className="text-xs text-slate-500">
              © 2026 Agent Runway Inc. All rights reserved.
            </p>
            <p className="text-[11px] text-slate-600">
              Agent Runway Inc. — Canada Corporation No. 1786542-2
            </p>
          </div>
          <p className="text-xs text-slate-600">
            For informational purposes only. Not financial or tax advice.
          </p>
        </div>

      </div>
    </footer>
  );
}
