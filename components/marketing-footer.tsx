import Link from "next/link";
import Image from "next/image";

// ── Footer link columns ───────────────────────────────────────────────────────

const FOOTER_LINKS = {
  Product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Demo", href: "/demo" },
  ],
  Resources: [
    { label: "Metrics Library", href: "/real-estate-metrics" },
    { label: "GCI Tracking Guide", href: "/how-real-estate-agents-track-gci" },
    { label: "Real Estate Analytics", href: "/real-estate-business-analytics" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
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

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 sm:flex-row">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} Agent Runway. Built in Canada 🇨🇦
          </p>
          <p className="text-xs text-slate-600">
            For informational purposes only. Not financial or tax advice.
          </p>
        </div>

      </div>
    </footer>
  );
}
