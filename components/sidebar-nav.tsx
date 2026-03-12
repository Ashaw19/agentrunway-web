"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  History,
  TrendingUp,
  Receipt,
  FileText,
  ArrowLeftRight,
  Sparkles,
  Users,
  Share2,
  Globe,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

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
    label: "History",
    href: "/history",
    icon: History,
    iconActive: "text-sky-300",
    iconInactive: "text-sky-400/60",
    borderActive: "border-l-sky-400",
  },
  {
    label: "Clients",
    href: "/clients",
    icon: Users,
    iconActive: "text-teal-300",
    iconInactive: "text-teal-400/60",
    borderActive: "border-l-teal-400",
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
    label: "Social",
    href: "/social",
    icon: Share2,
    iconActive: "text-rose-300",
    iconInactive: "text-rose-400/60",
    borderActive: "border-l-rose-400",
  },
];


export function SidebarNav({ isPro = false }: { isPro?: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex h-screen w-64 flex-col border-r border-sidebar-border text-sidebar-foreground sidebar-gradient"
      style={{
        background: "linear-gradient(180deg, oklch(0.15 0.065 265) 0%, oklch(0.12 0.060 265) 55%, oklch(0.10 0.055 265) 100%)",
      }}
    >
      {/* Brand accent strip — Commission Gold → blue → violet (brand palette) */}
      <div
        className="h-[3px] w-full shrink-0"
        style={{ background: "linear-gradient(90deg, #F0A800 0%, #1E72F2 45%, #7C3AED 80%, #10B981 100%)" }}
      />

      {/* Brand lockup */}
      <div className="flex items-center gap-3 px-5 py-[22px]">
        <div className="shrink-0">
          <Image src="/logo.png" alt="Agent Runway" width={36} height={36} className="rounded-lg" />
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
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        <div className="space-y-0.5">
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
        </div>
      </nav>

      {/* Bottom separator */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-sidebar-border/70 to-transparent" />

      {/* Upgrade nudge — compact, always-visible, never covers nav items */}
      {!isPro && (
        <div className="px-3 pt-2 pb-1">
          <Link
            href="/pricing"
            className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-[12px] font-semibold transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #F0A800 0%, #D97706 100%)",
              color: "#15110A",
            }}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "#15110A" }} />
            <span className="flex-1">Unlock Pro</span>
            <span>→</span>
          </Link>
        </div>
      )}

      {/* Visit marketing site */}
      <div className="px-3 pb-3">
        <Link
          href="/"
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
        >
          <Globe className="h-3.5 w-3.5 shrink-0" />
          Visit Website
        </Link>
      </div>
    </aside>
  );
}
