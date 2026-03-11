"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X, LayoutDashboard } from "lucide-react";

// ── Nav links ─────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Demo", href: "/demo" },
  { label: "About", href: "/about" },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function MarketingNav({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/85 px-6 py-5 backdrop-blur-md sm:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Agent Runway"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="text-lg font-bold tracking-tight text-white">
            Agent Runway
          </span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-slate-400 transition-colors hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side: auth CTA + hamburger */}
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
            >
              Sign In
            </Link>
          )}
          <button
            className="flex items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="mx-auto mt-2 max-w-6xl border-t border-slate-800 pb-3 pt-3 md:hidden">
          <nav className="flex flex-col gap-0.5">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            ))}
            {isLoggedIn && (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-blue-400 transition-colors hover:bg-slate-800 hover:text-blue-300"
                onClick={() => setOpen(false)}
              >
                <LayoutDashboard className="h-4 w-4" />
                Go to Dashboard
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
