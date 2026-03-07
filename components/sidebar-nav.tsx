"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  History,
  TrendingUp,
  Receipt,
  FileText,
  LogOut,
  ArrowLeftRight,
  Layers,
  Settings,
  CircleUser,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    iconActive: "text-blue-300",
    iconInactive: "text-blue-400/60",
    borderActive: "border-l-blue-400",
  },
  {
    label: "Transactions",
    href: "/transactions",
    icon: ArrowLeftRight,
    iconActive: "text-emerald-300",
    iconInactive: "text-emerald-400/60",
    borderActive: "border-l-emerald-400",
  },
  {
    label: "Pipeline",
    href: "/pipeline",
    icon: Layers,
    iconActive: "text-violet-300",
    iconInactive: "text-violet-400/60",
    borderActive: "border-l-violet-400",
  },
  {
    label: "History",
    href: "/history",
    icon: History,
    iconActive: "text-sky-300",
    iconInactive: "text-sky-400/60",
    borderActive: "border-l-sky-400",
  },
  {
    label: "Forecast",
    href: "/forecast",
    icon: TrendingUp,
    iconActive: "text-violet-300",
    iconInactive: "text-violet-400/60",
    borderActive: "border-l-violet-400",
  },
  {
    label: "Expenses",
    href: "/expenses",
    icon: Receipt,
    iconActive: "text-amber-300",
    iconInactive: "text-amber-400/60",
    borderActive: "border-l-amber-400",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileText,
    iconActive: "text-slate-200",
    iconInactive: "text-slate-400/60",
    borderActive: "border-l-slate-400",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    iconActive: "text-slate-200",
    iconInactive: "text-slate-400/60",
    borderActive: "border-l-slate-400",
  },
  {
    label: "Profile",
    href: "/profile",
    icon: CircleUser,
    iconActive: "text-pink-300",
    iconInactive: "text-pink-400/60",
    borderActive: "border-l-pink-400",
  },
];

// ── Inline SVG logo mark ───────────────────────────────────────────────────
// Rendered as an SVG element instead of an <img> so it:
//   • Scales perfectly on all DPRs (Retina, 4K, etc.)
//   • Loads instantly with zero network request
//   • Inherits colour overrides via CSS if needed

function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sb-bg" x1="20" y1="0" x2="20" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1e2f5e"/>
          <stop offset="100%" stopColor="#0d1526"/>
        </linearGradient>
        <linearGradient id="sb-left" x1="3" y1="9" x2="16" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#6cb4ff"/>
          <stop offset="55%"  stopColor="#2e7be6"/>
          <stop offset="100%" stopColor="#1452a8"/>
        </linearGradient>
        <linearGradient id="sb-right" x1="37" y1="9" x2="24" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#6cb4ff"/>
          <stop offset="55%"  stopColor="#2e7be6"/>
          <stop offset="100%" stopColor="#1452a8"/>
        </linearGradient>
        <linearGradient id="sb-sheen" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.28"/>
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
        </linearGradient>
        <radialGradient id="sb-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#F97316" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#F97316" stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* Background */}
      <rect width="40" height="40" rx="9" fill="url(#sb-bg)"/>
      {/* Left panel */}
      <path d="M3 9 L17.5 9 L14.5 31 L3 31 Z" fill="url(#sb-left)"/>
      <path d="M3 9 L17.5 9 L17 13 L3 12.5 Z" fill="url(#sb-sheen)"/>
      {/* Right panel */}
      <path d="M22.5 9 L37 9 L37 31 L25.5 31 Z" fill="url(#sb-right)"/>
      <path d="M22.5 9 L37 9 L37 13.5 L23 13 Z" fill="url(#sb-sheen)"/>
      {/* Gap shadow (runway centerline) */}
      <rect x="15" y="9" width="10" height="22" fill="#0a1020" fillOpacity="0.5"/>
      {/* Velocity orange accent at vanishing point */}
      <circle cx="20" cy="14" r="5" fill="url(#sb-glow)"/>
      <circle cx="20" cy="14" r="1.8" fill="#F97316"/>
    </svg>
  );
}

export function SidebarNav({ isPro = false }: { isPro?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside
      className="hidden md:flex h-screen w-64 flex-col border-r border-sidebar-border text-sidebar-foreground sidebar-gradient"
      style={{
        background: "linear-gradient(180deg, oklch(0.15 0.065 265) 0%, oklch(0.12 0.060 265) 55%, oklch(0.10 0.055 265) 100%)",
      }}
    >
      {/* Brand accent strip — orange → blue → emerald (brand palette) */}
      <div
        className="h-[3px] w-full shrink-0"
        style={{ background: "linear-gradient(90deg, #F97316 0%, #1E72F2 40%, #7C3AED 70%, #10B981 100%)" }}
      />

      {/* Brand lockup */}
      <div className="flex items-center gap-3 px-5 py-[22px]">
        {/* Vector logo mark — pixel-perfect at all DPRs */}
        <div className="shrink-0 drop-shadow-md">
          <LogoMark size={36} />
        </div>
        <div>
          <span className="block text-[15px] font-bold tracking-tight text-sidebar-foreground">
            Agent Runway
          </span>
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/35">
            Business Analytics
          </span>
        </div>
      </div>

      {/* Separator with subtle fade */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-sidebar-border/70 to-transparent" />

      {/* Nav links */}
      <nav className="flex-1 space-y-0.5 px-2 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-all duration-150 border-l-[3px]",
                isActive
                  ? cn(
                      "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm",
                      item.borderActive,
                    )
                  : "border-l-transparent font-medium text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground hover:border-l-sidebar-border",
              )}
            >
              <item.icon
                className={cn(
                  "h-[17px] w-[17px] shrink-0 transition-colors duration-150",
                  isActive ? item.iconActive : item.iconInactive,
                )}
              />
              <span className="tracking-[0.015em]">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Upgrade nudge — Starter users only */}
      {!isPro && (
        <div className="mx-3 mb-3 overflow-hidden rounded-lg border border-amber-500/25 bg-gradient-to-br from-amber-500/15 to-orange-500/8 p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[12px] font-semibold text-sidebar-foreground/90">
              Go Professional
            </span>
          </div>
          <p className="mb-2.5 text-[11px] leading-relaxed text-sidebar-foreground/50">
            Runway score, tax planning, AI insights &amp; more.
          </p>
          <Link
            href="/pricing"
            className="block rounded-md bg-amber-500 px-3 py-1.5 text-center text-[11.5px] font-semibold text-white transition-colors hover:bg-amber-400"
          >
            Start Free Trial
          </Link>
        </div>
      )}

      {/* Bottom separator */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-sidebar-border/70 to-transparent" />

      {/* Sign out */}
      <div className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-[13px] font-medium text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-[17px] w-[17px]" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
