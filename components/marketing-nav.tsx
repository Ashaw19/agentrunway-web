"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X, LayoutDashboard, ArrowRight } from "lucide-react";

// ── Nav links ─────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Demo", href: "/demo" },
  { label: "About", href: "/about" },
] as const;

// ── Avatar helper ─────────────────────────────────────────────────────────────

function Avatar({ src, name, size }: { src?: string; name?: string; size: number }) {
  const initials = name
    ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const px = `${size}px`;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "Profile photo"}
        width={size}
        height={size}
        style={{ width: px, height: px, objectFit: "cover", borderRadius: "50%" }}
      />
    );
  }

  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #2563eb, #7c3aed)",
        fontSize: size < 36 ? "11px" : "13px",
        fontWeight: 700,
        color: "#fff",
      }}
    >
      {initials}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface MarketingNavProps {
  isLoggedIn?: boolean;
  avatarUrl?: string;
  displayName?: string;
}

export function MarketingNav({
  isLoggedIn = false,
  avatarUrl,
  displayName,
}: MarketingNavProps) {
  const [open, setOpen] = useState(false);
  const firstName = displayName?.trim().split(/\s+/)[0];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/85 backdrop-blur-md">

      {/* ── Main nav row ── */}
      <div className="px-6 py-5 sm:px-10">
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
              <>
                {/* Avatar with online ring — desktop only */}
                <div className="relative hidden md:block">
                  <div
                    className="rounded-full overflow-hidden"
                    style={{
                      width: 34,
                      height: 34,
                      outline: "2px solid #34d399",
                      outlineOffset: 2,
                    }}
                  >
                    <Avatar src={avatarUrl} name={displayName} size={34} />
                  </div>
                  {/* Green "signed in" dot */}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 rounded-full bg-emerald-400"
                    style={{ width: 10, height: 10, outline: "2px solid #020b18" }}
                  />
                </div>

                {/* Dashboard CTA */}
                <Link
                  href="/dashboard"
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
              >
                Sign In
              </Link>
            )}

            {/* Hamburger — mobile only */}
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
      </div>

      {/* ── Welcome banner — logged-in users only ── */}
      {isLoggedIn && (
        <div
          className="border-t border-blue-400/20 px-6 sm:px-10"
          style={{
            background:
              "linear-gradient(90deg, rgba(37,99,235,0.18) 0%, rgba(124,58,237,0.12) 50%, rgba(16,185,129,0.08) 100%)",
          }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 py-2">
            {/* Left: signed-in indicator */}
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-xs text-slate-400">
                {firstName ? (
                  <>
                    Welcome back,{" "}
                    <span className="font-semibold text-white">{firstName}</span>!
                    You&apos;re signed in.
                  </>
                ) : (
                  <>You&apos;re signed in.</>
                )}
              </span>
            </div>

            {/* Right: dashboard link with arrow */}
            <Link
              href="/dashboard"
              className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-blue-400 transition-colors hover:text-blue-300"
            >
              Go to your dashboard
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* ── Mobile dropdown ── */}
      {open && (
        <div className="mx-auto max-w-6xl border-t border-slate-800 px-6 pb-3 pt-3 sm:px-10 md:hidden">

          {/* Profile card at top of mobile menu when logged in */}
          {isLoggedIn && (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2.5">
              <div
                className="shrink-0 rounded-full overflow-hidden"
                style={{ outline: "2px solid #34d399", outlineOffset: 1 }}
              >
                <Avatar src={avatarUrl} name={displayName} size={36} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {displayName ?? "Signed in"}
                </p>
                <p className="text-[11px] text-emerald-400">● Signed in</p>
              </div>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                Dashboard →
              </Link>
            </div>
          )}

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
