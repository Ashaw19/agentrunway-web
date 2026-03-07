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
        {/* Background: deep radial navy, vignette to near-black at edges */}
        <radialGradient id="sb-bg" cx="20" cy="20" r="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0e1a38"/>
          <stop offset="100%" stopColor="#060c18"/>
        </radialGradient>
        {/* Left panel: bright cyan-blue top → electric blue → deep blue */}
        <linearGradient id="sb-left" x1="3" y1="9" x2="16" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#a8d8ff"/>
          <stop offset="45%"  stopColor="#2d82f5"/>
          <stop offset="100%" stopColor="#1245a5"/>
        </linearGradient>
        {/* Right panel: slightly brighter (light source from upper-right) */}
        <linearGradient id="sb-right" x1="37" y1="9" x2="24" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#b8e0ff"/>
          <stop offset="45%"  stopColor="#3590ff"/>
          <stop offset="100%" stopColor="#1450b8"/>
        </linearGradient>
        {/* Glass sheen: 3-stop — strong at top edge, fades out */}
        <linearGradient id="sb-sheen" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.52"/>
          <stop offset="45%"  stopColor="#ffffff" stopOpacity="0.14"/>
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Background */}
      <rect width="40" height="40" rx="9" fill="url(#sb-bg)"/>
      {/* Left panel */}
      <path d="M3 9 L17.5 9 L14.5 31 L3 31 Z" fill="url(#sb-left)"/>
      {/* Left panel glass sheen (wider strip for more glassy look) */}
      <path d="M3 9 L17.5 9 L16.5 15 L3 13.5 Z" fill="url(#sb-sheen)"/>
      {/* Left panel inner-edge shadow (panel depth separator) */}
      <path d="M16.5 10 L14 30" stroke="#050b16" strokeWidth="1.5" strokeOpacity="0.45" strokeLinecap="round"/>
      {/* Right panel */}
      <path d="M22.5 9 L37 9 L37 31 L25.5 31 Z" fill="url(#sb-right)"/>
      {/* Right panel glass sheen */}
      <path d="M22.5 9 L37 9 L37 15.5 L23 14 Z" fill="url(#sb-sheen)"/>
      {/* Right panel inner-edge shadow */}
      <path d="M23.5 10 L26 30" stroke="#050b16" strokeWidth="1.5" strokeOpacity="0.45" strokeLinecap="round"/>
      {/* Gap shadow (runway centerline) */}
      <rect x="15" y="9" width="10" height="22" fill="#0a1020" fillOpacity="0.65"/>
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
        <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] p-3.5">
          <div className="mb-1 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[12px] font-semibold text-sidebar-foreground/85">
              Go Professional
            </span>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-sidebar-foreground/45">
            Runway score, tax planning, AI insights &amp; more.
          </p>
          <Link
            href="/pricing"
            className="block rounded-md bg-blue-600 px-3 py-1.5 text-center text-[11.5px] font-semibold text-white transition-colors hover:bg-blue-500"
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
