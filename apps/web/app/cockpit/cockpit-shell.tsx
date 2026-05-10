"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tailfin } from "@/components/icons/brand-icons";
import { cn } from "@/lib/utils";
import { DirectorChatDock } from "./director-chat-dock";

const TABS = [
  { href: "/cockpit",              label: "Snapshot" },
  { href: "/cockpit/inbox",        label: "Inbox" },
  { href: "/cockpit/cash",         label: "Cash" },
  { href: "/cockpit/expenses",     label: "Expenses" },
  { href: "/cockpit/pre-incorp",   label: "Pre-incorp" },
  { href: "/cockpit/founder-comp", label: "Comp" },
  { href: "/cockpit/brief",        label: "Brief" },
  { href: "/cockpit/hst",          label: "HST" },
  { href: "/cockpit/sred",         label: "SR&ED" },
  { href: "/cockpit/deadlines",    label: "Deadlines" },
  { href: "/cockpit/compliance",      label: "Compliance" },
  { href: "/cockpit/reconciliation",  label: "Reconciliation" },
  { href: "/cockpit/documents",       label: "Documents" },
  { href: "/cockpit/resolutions",     label: "Resolutions" },
  { href: "/cockpit/year-end",        label: "Year-end" },
];

export function CockpitShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeHref = TABS.reduce(
    (best, tab) =>
      pathname === tab.href || pathname.startsWith(tab.href + "/")
        ? tab.href.length > best.length
          ? tab.href
          : best
        : best,
    "",
  );

  return (
    <div className="dark text-foreground relative flex min-h-svh flex-col bg-[oklch(0.235_0.055_262)] font-[var(--font-cockpit-body)] antialiased">
      {/* Layered background: dotted micro-grid + soft top-of-page aurora glow.
          The aurora gives the page a subtle sense of "sky" without competing
          with content — pure decoration. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 opacity-[0.30]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.55) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px]"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 50% 0%, rgb(129 140 248 / 0.32), transparent 75%)",
        }}
      />

      <header className="border-border/50 sticky top-0 z-20 border-b bg-[oklch(0.235_0.055_262/0.85)] backdrop-blur-md supports-[backdrop-filter]:bg-[oklch(0.235_0.055_262/0.65)]">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 pt-4 pb-2 sm:px-6 lg:px-8">
          <Link
            href="/cockpit"
            className="text-foreground inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight"
          >
            <span
              aria-hidden
              className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-500/20 to-violet-500/10 ring-1 ring-inset ring-white/10"
            >
              <Tailfin className="text-blue-300 h-3.5 w-3.5" aria-hidden />
            </span>
            <span>Cockpit</span>
            <span className="text-muted-foreground/60 text-xs font-normal">· Agent Runway Inc.</span>
          </Link>
          <div className="ml-auto inline-flex items-center gap-3 text-xs">
            <span
              title="Most cards are live; cards still on placeholder data show their own 'fake' badge."
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1 text-[11px] tracking-wide text-amber-300/90"
            >
              <span className="bg-amber-400 inline-block h-1.5 w-1.5 rounded-full" aria-hidden />
              Phase 1 · partial wiring
            </span>
          </div>
        </div>
        <nav className="-mb-px overflow-x-auto" aria-label="Cockpit sections">
          <ul className="mx-auto flex max-w-7xl gap-0.5 px-4 sm:px-6 lg:px-8">
            {TABS.map((tab) => {
              const isActive = activeHref === tab.href;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative inline-flex items-center px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground/80 hover:text-foreground",
                    )}
                  >
                    {tab.label}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute right-3 -bottom-px left-3 h-[2px] rounded-full transition-all",
                        isActive
                          ? "bg-gradient-to-r from-blue-400 via-blue-300 to-violet-300 opacity-100"
                          : "bg-transparent opacity-0",
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>

      <DirectorChatDock />

      <footer className="border-border/40 mt-auto border-t">
        <div className="text-muted-foreground/70 mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-muted-foreground/40 inline-block h-1 w-1 rounded-full" aria-hidden />
            Cockpit · v0.1 · for Andrew Shaw only
          </span>
          <span>Agent Runway Inc. · CCPC NB · FY ends Dec 31</span>
        </div>
      </footer>
    </div>
  );
}
