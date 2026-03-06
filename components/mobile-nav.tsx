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
];

export function MobileNav() {
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Agent Runway" width={24} height={24} className="rounded-md" />
        <span className="text-sm font-semibold">Agent Runway</span>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0 text-sidebar-foreground">
          <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500" />

          <SheetHeader className="px-5 pb-0 pt-5">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Agent Runway" width={34} height={34} className="rounded-xl" />
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
