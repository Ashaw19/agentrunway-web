"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Anchor } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/cockpit", label: "Snapshot" },
  { href: "/cockpit/cash", label: "Cash" },
  { href: "/cockpit/expenses", label: "Expenses" },
  { href: "/cockpit/hst", label: "HST" },
  { href: "/cockpit/sred", label: "SR&ED" },
  { href: "/cockpit/deadlines", label: "Deadlines" },
  { href: "/cockpit/documents", label: "Documents" },
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
    <div className="dark bg-background text-foreground min-h-svh font-sans antialiased">
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.35) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />
      <header className="border-border/60 bg-background/85 sticky top-0 z-20 border-b backdrop-blur supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 pt-4 pb-2 sm:px-6 lg:px-8">
          <Link
            href="/cockpit"
            className="text-foreground inline-flex items-center gap-2 font-mono text-sm font-medium tracking-tight"
          >
            <Anchor className="text-primary h-4 w-4" aria-hidden />
            <span>Cockpit</span>
            <span className="text-muted-foreground/70 text-xs">Agent Runway Inc.</span>
          </Link>
          <div className="ml-auto inline-flex items-center gap-3 text-xs">
            <span className="bg-primary/15 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono">
              <span className="bg-primary inline-block h-1.5 w-1.5 rounded-full" aria-hidden />
              Phase 1 · fake data
            </span>
          </div>
        </div>
        <nav
          className="-mb-px overflow-x-auto"
          aria-label="Cockpit sections"
        >
          <ul className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6 lg:px-8">
            {TABS.map((tab) => {
              const isActive = activeHref === tab.href;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative inline-flex items-center px-3 py-2.5 font-mono text-xs whitespace-nowrap transition-colors",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute right-3 -bottom-px left-3 h-px",
                        isActive ? "bg-primary" : "bg-transparent",
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      <footer className="border-border/40 mt-auto border-t">
        <div className="text-muted-foreground mx-auto flex max-w-7xl items-center justify-between px-4 py-4 font-mono text-[11px] sm:px-6 lg:px-8">
          <span>Cockpit · v0.1 · for Andrew Shaw only</span>
          <span>Agent Runway Inc. · CCPC NB · FY ends Dec 31</span>
        </div>
      </footer>
    </div>
  );
}
