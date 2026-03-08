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
import Image from "next/image";
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
              Unlock Pro
            </span>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-sidebar-foreground/45">
            Runway score, tax planning, AI advisor &amp; more. Pays for itself.
          </p>
          <Link
            href="/pricing"
            className="block rounded-md bg-blue-600 px-3 py-1.5 text-center text-[11.5px] font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Unlock Everything →
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
