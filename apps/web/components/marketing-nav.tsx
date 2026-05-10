"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import {
  Menu,
  X,
  LayoutDashboard,
  ArrowRight,
  CircleUser,
  Settings,
  ArrowLeftRight,
  Receipt,
  TrendingUp,
  LogOut,
  ChevronDown,
  History,
  FileText,
} from "lucide-react";
import { Tailfin } from "@/components/icons/brand-icons";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

// ── Nav links ─────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "For Canadian Agents", href: "/canadian-real-estate-agent-financial-platform" },
  { label: "Pricing", href: "/pricing" },
  { label: "Free Tools", href: "/tools" },
  { label: "Demo", href: "/demo" },
  { label: "Blog", href: "/blog" },
  { label: "About", href: "/about" },
] as const;

// ── Avatar dropdown items ─────────────────────────────────────────────────────

const DROPDOWN_ITEMS = [
  { label: "Dashboard",    href: "/dashboard",    icon: LayoutDashboard },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight  },
  { label: "CRM",           href: "/crm",           icon: History          },
  { label: "Forecast",     href: "/forecast",     icon: TrendingUp      },
  { label: "Expenses",     href: "/expenses",     icon: Receipt          },
  { label: "Reports",      href: "/reports",      icon: FileText         },
  { label: "Profile",      href: "/profile",      icon: CircleUser       },
  { label: "Settings",     href: "/settings",     icon: Settings         },
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
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Capitalize the first letter of each word — "andrew shaw" → "Andrew Shaw" */
function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Component ─────────────────────────────────────────────────────────────────

interface MarketingNavProps {
  /** @deprecated — nav now auto-detects auth. Kept for backwards compatibility. */
  isLoggedIn?: boolean;
  avatarUrl?: string;
  displayName?: string;
}

export function MarketingNav({
  isLoggedIn: isLoggedInProp,
  avatarUrl: avatarUrlProp,
  displayName: displayNameProp,
}: MarketingNavProps) {
  const [open, setOpen]             = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef                   = useRef<HTMLDivElement>(null);
  const router                      = useRouter();

  // ── Auto-detect auth session when props aren't provided ────────────
  const [sessionUser, setSessionUser] = useState<{
    loggedIn: boolean;
    avatar?: string;
    name?: string;
  } | null>(null);

  useEffect(() => {
    // If props were explicitly provided, skip auto-detection
    if (isLoggedInProp !== undefined) return;

    let cancelled = false;
    const supabase = createClient();

    async function resolveUser(userId: string, email?: string, meta?: Record<string, unknown>) {
      // Fetch profile from user_settings (has real avatar + display name)
      const { data: settings } = await supabase
        .from("user_settings")
        .select("avatar_url, display_name")
        .eq("user_id", userId)
        .single();

      if (cancelled) return;

      const avatar = settings?.avatar_url
        ?? (meta?.avatar_url as string | undefined)
        ?? (meta?.picture as string | undefined)
        ?? undefined;

      const rawName = settings?.display_name
        || (meta?.full_name as string | undefined)
        || (meta?.name as string | undefined)
        || email?.split("@")[0]
        || undefined;

      setSessionUser({
        loggedIn: true,
        avatar,
        name: rawName ? capitalize(rawName) : undefined,
      });
    }

    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          resolveUser(session.user.id, session.user.email ?? undefined, session.user.user_metadata);
        } else {
          setSessionUser({ loggedIn: false });
        }
      } catch {
        if (!cancelled) setSessionUser({ loggedIn: false });
      }
    }

    checkSession();

    // Listen for auth state changes (sign in/out while on page)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) {
        resolveUser(session.user.id, session.user.email ?? undefined, session.user.user_metadata);
      } else {
        setSessionUser({ loggedIn: false });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isLoggedInProp]);

  // Resolve final values: explicit props take priority over auto-detected
  const isLoggedIn  = isLoggedInProp ?? sessionUser?.loggedIn ?? false;
  const avatarUrl   = avatarUrlProp  ?? sessionUser?.avatar;
  const displayName = (displayNameProp ?? sessionUser?.name)
    ? capitalize((displayNameProp ?? sessionUser?.name)!)
    : undefined;
  const firstName   = displayName?.trim().split(/\s+/)[0];

  // Close avatar dropdown on outside click
  useEffect(() => {
    if (!avatarOpen) return;
    function handleOutside(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [avatarOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

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

          {/* Right side */}
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                {/* ── Avatar button + dropdown — desktop only ── */}
                <div ref={avatarRef} className="relative hidden md:block">
                  <button
                    onClick={() => setAvatarOpen((v) => !v)}
                    className="flex items-center gap-1.5 rounded-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label="Open account menu"
                    aria-expanded={avatarOpen}
                  >
                    {/* Avatar ring */}
                    <div
                      className="relative rounded-full overflow-hidden"
                      style={{
                        width: 34,
                        height: 34,
                        outline: "2px solid #34d399",
                        outlineOffset: 2,
                      }}
                    >
                      <Avatar src={avatarUrl} name={displayName} size={34} />
                    </div>
                    {/* Online dot */}
                    <span
                      className="absolute -bottom-0.5 -right-0.5 rounded-full bg-emerald-400"
                      style={{ width: 10, height: 10, outline: "2px solid #020b18" }}
                    />
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${avatarOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {/* ── Dropdown panel ── */}
                  {avatarOpen && (
                    <div
                      className="absolute right-0 top-full mt-3 w-56 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60"
                      style={{ zIndex: 60 }}
                    >
                      {/* User identity header */}
                      <div className="flex items-center gap-3 border-b border-slate-700/60 px-4 py-3">
                        <div
                          className="shrink-0 rounded-full overflow-hidden"
                          style={{ outline: "2px solid #34d399", outlineOffset: 1 }}
                        >
                          <Avatar src={avatarUrl} name={displayName} size={32} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {displayName ?? "My Account"}
                          </p>
                          <p className="text-[11px] text-emerald-400">● Signed in</p>
                        </div>
                      </div>

                      {/* Nav items */}
                      <div className="py-1.5">
                        {DROPDOWN_ITEMS.map(({ label, href, icon: Icon }) => (
                          <Link
                            key={href}
                            href={href}
                            onClick={() => setAvatarOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                          >
                            <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                            {label}
                          </Link>
                        ))}
                      </div>

                      {/* Sign out */}
                      <div className="border-t border-slate-700/60 py-1.5">
                        <button
                          onClick={() => { setAvatarOpen(false); handleSignOut(); }}
                          className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-400"
                        >
                          <LogOut className="h-4 w-4 shrink-0" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Dashboard CTA button */}
                <Link
                  href="/dashboard"
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                {/* Talk to Captain — secondary CTA, desktop only */}
                <Link
                  href="/captain"
                  className="hidden items-center gap-1.5 sm:flex rounded-lg border border-blue-600/40 px-3.5 py-2 text-sm font-medium text-blue-400 transition-colors hover:bg-blue-600/10 hover:text-blue-300"
                >
                  <Tailfin className="h-3.5 w-3.5" />
                  Talk to Captain
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
                >
                  Sign In
                </Link>
              </>
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
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
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

          {/* Profile card */}
          {isLoggedIn && (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2.5">
              <div
                className="shrink-0 overflow-hidden rounded-full"
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
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
              >
                Dashboard →
              </Link>
            </div>
          )}

          <nav className="flex flex-col gap-0.5">
            {/* Marketing links */}
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

            {/* Talk to Captain — mobile, logged-out only */}
            {!isLoggedIn && (
              <Link
                href="/captain"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-400 transition-colors hover:bg-blue-600/10"
              >
                <Tailfin className="h-4 w-4 shrink-0" />
                Talk to Captain
              </Link>
            )}

            {/* App links when signed in */}
            {isLoggedIn && (
              <>
                <div className="my-1.5 h-px bg-slate-800" />
                {DROPDOWN_ITEMS.map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                    {label}
                  </Link>
                ))}
                <div className="my-1.5 h-px bg-slate-800" />
                <button
                  onClick={() => { setOpen(false); handleSignOut(); }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-400"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Sign Out
                </button>
              </>
            )}
          </nav>

        </div>
      )}

    </header>
  );
}
