"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  FileText,
  LogOut,
  ArrowLeftRight,
  Settings,
  Menu,
  CircleUser,
  Sparkles,
  Users,
  Share2,
  Layers,
  BarChart2,
  BookOpen,
  Building2,
  CreditCard,
  Shield,
  Lock,
  LifeBuoy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrgContext } from "@/lib/types/organizations";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


type MobileNavEntry =
  | { type: "header"; label: string }
  | { type: "item"; label: string; href: string; icon: LucideIcon; iconActive: string; iconInactive: string; borderActive: string };

const mobileNavEntries: MobileNavEntry[] = [
  // ── FINANCIALS ─────────────────────────────────────────────────
  { type: "header", label: "FINANCIALS" },
  {
    type: "item", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard,
    iconActive: "text-blue-300", iconInactive: "text-blue-400/70", borderActive: "border-l-blue-400",
  },
  {
    type: "item", label: "Transactions", href: "/transactions", icon: ArrowLeftRight,
    iconActive: "text-emerald-300", iconInactive: "text-emerald-400/70", borderActive: "border-l-emerald-400",
  },
  {
    type: "item", label: "Pipeline", href: "/pipeline", icon: Layers,
    iconActive: "text-amber-300", iconInactive: "text-amber-400/70", borderActive: "border-l-amber-400",
  },
  {
    type: "item", label: "Expenses", href: "/expenses", icon: Receipt,
    iconActive: "text-orange-300", iconInactive: "text-orange-400/70", borderActive: "border-l-orange-400",
  },
  {
    type: "item", label: "Altimeter", href: "/altimeter", icon: BarChart2,
    iconActive: "text-cyan-300", iconInactive: "text-cyan-400/70", borderActive: "border-l-cyan-400",
  },
  {
    type: "item", label: "Overhead", href: "/overhead", icon: Receipt,
    iconActive: "text-red-300", iconInactive: "text-red-400/70", borderActive: "border-l-red-400",
  },
  {
    type: "item", label: "Forecast", href: "/forecast", icon: TrendingUp,
    iconActive: "text-violet-300", iconInactive: "text-violet-400/70", borderActive: "border-l-violet-400",
  },
  {
    type: "item", label: "Reports", href: "/reports", icon: FileText,
    iconActive: "text-sky-300", iconInactive: "text-sky-400/70", borderActive: "border-l-sky-400",
  },
  // ── CRM ────────────────────────────────────────────────────────
  { type: "header", label: "CRM" },
  {
    type: "item", label: "CRM", href: "/crm", icon: Users,
    iconActive: "text-teal-300", iconInactive: "text-teal-400/70", borderActive: "border-l-teal-400",
  },
  {
    type: "item", label: "Flight Control", href: "/flight-control", icon: Sparkles,
    iconActive: "text-fuchsia-300", iconInactive: "text-fuchsia-400/70", borderActive: "border-l-fuchsia-400",
  },
  // ── TOOLS ──────────────────────────────────────────────────────
  { type: "header", label: "TOOLS" },
  {
    type: "item", label: "Social", href: "/social", icon: Share2,
    iconActive: "text-rose-300", iconInactive: "text-rose-400/70", borderActive: "border-l-rose-400",
  },
  {
    type: "item", label: "Guide", href: "/guide", icon: BookOpen,
    iconActive: "text-indigo-300", iconInactive: "text-indigo-400/70", borderActive: "border-l-indigo-400",
  },
  {
    type: "item", label: "Settings", href: "/settings", icon: Settings,
    iconActive: "text-slate-200", iconInactive: "text-slate-400/70", borderActive: "border-l-slate-400",
  },
  {
    type: "item", label: "Profile", href: "/profile", icon: CircleUser,
    iconActive: "text-pink-300", iconInactive: "text-pink-400/70", borderActive: "border-l-pink-400",
  },
];

export function MobileNav({
  isPro = false,
  orgContext = null,
}: {
  isPro?: boolean;
  orgContext?: OrgContext | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Build org-specific mobile nav entries dynamically
  const orgEntries: MobileNavEntry[] = orgContext
    ? [
        { type: "header", label: "YOUR TEAM" },
        {
          type: "item",
          label: orgContext.org.name.length > 18
            ? orgContext.org.name.slice(0, 16) + "\u2026"
            : orgContext.org.name,
          href: "/org",
          icon: Building2,
          iconActive: "text-white",
          iconInactive: "text-sidebar-foreground/50",
          borderActive: "border-l-primary",
        },
        ...(orgContext.isAdmin
          ? [
              {
                type: "item" as const,
                label: "Members",
                href: "/org/members",
                icon: Users,
                iconActive: "text-orange-300",
                iconInactive: "text-orange-400/60",
                borderActive: "border-l-orange-400",
              },
              {
                type: "item" as const,
                label: "Settings",
                href: "/org/settings",
                icon: Settings,
                iconActive: "text-orange-300",
                iconInactive: "text-orange-400/60",
                borderActive: "border-l-orange-400",
              },
              {
                type: "item" as const,
                label: "Billing",
                href: "/org/billing",
                icon: CreditCard,
                iconActive: "text-orange-300",
                iconInactive: "text-orange-400/60",
                borderActive: "border-l-orange-400",
              },
              {
                type: "item" as const,
                label: "Audit Log",
                href: "/org/audit-log",
                icon: Shield,
                iconActive: "text-orange-300",
                iconInactive: "text-orange-400/60",
                borderActive: "border-l-orange-400",
              },
            ]
          : [
              {
                type: "item" as const,
                label: "My Consent",
                href: "/consent",
                icon: Lock,
                iconActive: "text-orange-300",
                iconInactive: "text-orange-400/60",
                borderActive: "border-l-orange-400",
              },
            ]),
      ]
    : [];

  // Insert org entries between CRM and TOOLS sections
  const allMobileEntries: MobileNavEntry[] = [];
  for (const entry of mobileNavEntries) {
    allMobileEntries.push(entry);
    // Insert org entries after the last CRM item (Flight Control)
    if (entry.type === "item" && entry.href === "/flight-control") {
      allMobileEntries.push(...orgEntries);
    }
  }

  // Avatar state
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? null);
      const { data: settings } = await supabase
        .from("user_settings")
        .select("display_name, avatar_url")
        .eq("user_id", user.id)
        .single();
      if (settings) {
        setDisplayName(settings.display_name ?? null);
        setAvatarUrl(settings.avatar_url ?? null);
      }
    }
    loadUser();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
  }

  const initials = (displayName?.[0] ?? email?.[0] ?? "?").toUpperCase();

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
        {/* Hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo + Title */}
        <Image src="/logo.png" alt="Agent Runway" width={26} height={26} className="rounded-lg" />
        <span className="text-sm font-semibold flex-1">Agent Runway</span>

        {/* Avatar dropdown on far right */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-border hover:ring-primary/50 transition-all overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName ?? "Profile"}
                  width={32}
                  height={32}
                  className="object-cover"
                />
              ) : (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #1E72F2 0%, #7C3AED 100%)" }}
                >
                  {initials}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {(displayName || email) && (
              <>
                <div className="px-2 py-1.5">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {displayName ?? email}
                  </p>
                  {displayName && email && (
                    <p className="text-[11px] text-muted-foreground truncate">{email}</p>
                  )}
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                <CircleUser className="h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0 text-sidebar-foreground">
          <div
            className="h-[3px] w-full shrink-0"
            style={{ background: "linear-gradient(90deg, #F97316 0%, #1E72F2 40%, #7C3AED 70%, #10B981 100%)" }}
          />

          <SheetHeader className="px-5 pb-0 pt-5">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Agent Runway" width={34} height={34} className="rounded-lg" />
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

          <nav className="flex-1 space-y-0.5 px-2 py-4 overflow-y-auto">
            {allMobileEntries.map((entry, i) => {
              if (entry.type === "header") {
                return (
                  <div key={entry.label} className={cn("px-3 pb-1", i === 0 ? "pt-0" : "pt-4")}>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/35">
                      {entry.label}
                    </span>
                  </div>
                );
              }
              const isActive = pathname === entry.href;
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 border-l-[3px]",
                    isActive
                      ? cn(
                          "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
                          entry.borderActive,
                        )
                      : "border-l-transparent font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  )}
                >
                  <entry.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 transition-colors duration-150",
                      isActive ? entry.iconActive : entry.iconInactive,
                    )}
                  />
                  <span className="tracking-[0.01em]">{entry.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mx-4 h-px bg-sidebar-border/60" />

          {/* Upgrade nudge — Starter users only */}
          {!isPro && (
            <div className="mx-3 my-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] p-3.5">
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-[12px] font-semibold text-sidebar-foreground/85">
                  Unlock Pro
                </span>
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-sidebar-foreground/45">
                Runway score, tax estimates, Flight Crew &amp; more.
              </p>
              <Link
                href="/pricing"
                className="block rounded-md bg-blue-600 px-3 py-1.5 text-center text-[11.5px] font-semibold text-white transition-colors hover:bg-blue-500"
                onClick={() => setOpen(false)}
              >
                Unlock Everything →
              </Link>
            </div>
          )}

          <div className="mx-4 h-px bg-sidebar-border/60" />

          {/* Support contact — beta users need a human-reachable escape hatch
              from inside the app, not buried on the marketing site. */}
          <div className="px-3 pt-3">
            <a
              href="mailto:support@agentrunway.ca"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground transition-colors"
            >
              <LifeBuoy className="h-[18px] w-[18px] shrink-0" />
              Contact Support
            </a>
          </div>

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
