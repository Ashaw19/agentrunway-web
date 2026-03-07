"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Menu,
  CircleUser,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function MobileLogoMark({ size = 34 }: { size?: number }) {
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
        <linearGradient id="mn-bg" x1="20" y1="0" x2="20" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e2f5e" /><stop offset="100%" stopColor="#0d1526" />
        </linearGradient>
        <linearGradient id="mn-left" x1="3" y1="9" x2="16" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6cb4ff" /><stop offset="55%" stopColor="#2e7be6" /><stop offset="100%" stopColor="#1452a8" />
        </linearGradient>
        <linearGradient id="mn-right" x1="37" y1="9" x2="24" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6cb4ff" /><stop offset="55%" stopColor="#2e7be6" /><stop offset="100%" stopColor="#1452a8" />
        </linearGradient>
        <linearGradient id="mn-sheen" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" /><stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="mn-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F97316" stopOpacity="0.4" /><stop offset="100%" stopColor="#F97316" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="40" height="40" rx="9" fill="url(#mn-bg)" />
      <path d="M3 9 L17.5 9 L14.5 31 L3 31 Z" fill="url(#mn-left)" />
      <path d="M3 9 L17.5 9 L17 13 L3 12.5 Z" fill="url(#mn-sheen)" />
      <path d="M22.5 9 L37 9 L37 31 L25.5 31 Z" fill="url(#mn-right)" />
      <path d="M22.5 9 L37 9 L37 13.5 L23 13 Z" fill="url(#mn-sheen)" />
      <rect x="15" y="9" width="10" height="22" fill="#0a1020" fillOpacity="0.5" />
      <circle cx="20" cy="14" r="5" fill="url(#mn-glow)" />
      <circle cx="20" cy="14" r="1.8" fill="#F97316" />
    </svg>
  );
}

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    iconActive: "text-blue-300",
    iconInactive: "text-blue-400/70",
    borderActive: "border-l-blue-400",
  },
  {
    label: "Transactions",
    href: "/transactions",
    icon: ArrowLeftRight,
    iconActive: "text-emerald-300",
    iconInactive: "text-emerald-400/70",
    borderActive: "border-l-emerald-400",
  },
  {
    label: "Pipeline",
    href: "/pipeline",
    icon: Layers,
    iconActive: "text-violet-300",
    iconInactive: "text-violet-400/70",
    borderActive: "border-l-violet-400",
  },
  {
    label: "History",
    href: "/history",
    icon: History,
    iconActive: "text-sky-300",
    iconInactive: "text-sky-400/70",
    borderActive: "border-l-sky-400",
  },
  {
    label: "Forecast",
    href: "/forecast",
    icon: TrendingUp,
    iconActive: "text-violet-300",
    iconInactive: "text-violet-400/70",
    borderActive: "border-l-violet-400",
  },
  {
    label: "Expenses",
    href: "/expenses",
    icon: Receipt,
    iconActive: "text-amber-300",
    iconInactive: "text-amber-400/70",
    borderActive: "border-l-amber-400",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileText,
    iconActive: "text-slate-200",
    iconInactive: "text-slate-400/70",
    borderActive: "border-l-slate-400",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    iconActive: "text-slate-200",
    iconInactive: "text-slate-400/70",
    borderActive: "border-l-slate-400",
  },
  {
    label: "Profile",
    href: "/profile",
    icon: CircleUser,
    iconActive: "text-pink-300",
    iconInactive: "text-pink-400/70",
    borderActive: "border-l-pink-400",
  },
];

export function MobileNav({ isPro = false }: { isPro?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <MobileLogoMark size={26} />
        <span className="text-sm font-semibold">Agent Runway</span>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0 text-sidebar-foreground">
          <div
            className="h-[3px] w-full shrink-0"
            style={{ background: "linear-gradient(90deg, #F97316 0%, #1E72F2 40%, #7C3AED 70%, #10B981 100%)" }}
          />

          <SheetHeader className="px-5 pb-0 pt-5">
            <div className="flex items-center gap-3">
              <MobileLogoMark size={34} />
              <div>
                <SheetTitle className="text-[15px] font-semibold text-sidebar-foreground">
                  Agent Runway
                </SheetTitle>
                <span className="block text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/40">
                  Business Analytics
                </span>
              </div>
            </div>
          </SheetHeader>

          <div className="mx-4 mt-4 h-px bg-sidebar-border/60" />

          <nav className="flex-1 space-y-0.5 px-2 py-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 border-l-[3px]",
                    isActive
                      ? cn(
                          "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
                          item.borderActive,
                        )
                      : "border-l-transparent font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 transition-colors duration-150",
                      isActive ? item.iconActive : item.iconInactive,
                    )}
                  />
                  <span className="tracking-[0.01em]">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mx-4 h-px bg-sidebar-border/60" />

          {/* Upgrade nudge — Starter users only */}
          {!isPro && (
            <div className="mx-3 my-3 overflow-hidden rounded-lg border border-amber-500/25 bg-gradient-to-br from-amber-500/15 to-orange-500/8 p-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[12px] font-semibold text-sidebar-foreground/90">
                  Go Professional
                </span>
              </div>
              <p className="mb-2.5 text-[11px] leading-relaxed text-sidebar-foreground/55">
                Runway score, tax planning, AI insights &amp; more.
              </p>
              <Link
                href="/pricing"
                className="block rounded-md bg-amber-500 px-3 py-1.5 text-center text-[11.5px] font-semibold text-white transition-colors hover:bg-amber-400"
                onClick={() => setOpen(false)}
              >
                Start Free Trial
              </Link>
            </div>
          )}

          <div className="mx-4 h-px bg-sidebar-border/60" />

          <div className="p-3">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="h-[18px] w-[18px]" />
              Sign Out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
