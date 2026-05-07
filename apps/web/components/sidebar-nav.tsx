"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  FileText,
  ArrowLeftRight,
  CreditCard,

  Sparkles,
  Users,
  Share2,
  Globe,
  BookOpen,
  Building2,
  Shield,
  Settings,
  Lock,
  BarChart2,
  Layers,
  UserPlus,
  LifeBuoy,
  Home,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { OrgContext } from "@/lib/types/organizations";

type SidebarEntry =
  | { type: "header"; label: string }
  | { type: "item"; label: string; subLabel?: string; href: string; icon: LucideIcon; iconActive: string; iconInactive: string; borderActive: string; textActive?: string; dataTour?: string };

const sidebarEntries: SidebarEntry[] = [
  // ── FINANCIALS ─────────────────────────────────────────────────
  { type: "header", label: "FINANCIALS" },
  {
    type: "item", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard,
    iconActive: "text-blue-300", iconInactive: "text-blue-400/50", borderActive: "border-l-blue-400", textActive: "text-blue-200",
  },
  {
    type: "item", label: "Transactions", href: "/transactions", icon: ArrowLeftRight,
    iconActive: "text-emerald-300", iconInactive: "text-emerald-400/50", borderActive: "border-l-emerald-400", textActive: "text-emerald-200",
  },
  {
    type: "item", label: "Pipeline", href: "/pipeline", icon: Layers,
    iconActive: "text-amber-300", iconInactive: "text-amber-400/50", borderActive: "border-l-amber-400", textActive: "text-amber-200",
  },
  {
    type: "item", label: "Expenses", href: "/expenses", icon: Receipt,
    iconActive: "text-orange-300", iconInactive: "text-orange-400/50", borderActive: "border-l-orange-400", textActive: "text-orange-200",
  },
  {
    type: "item", label: "Altimeter", subLabel: "Analytics", href: "/altimeter", icon: BarChart2,
    iconActive: "text-cyan-300", iconInactive: "text-cyan-400/50", borderActive: "border-l-cyan-400", textActive: "text-cyan-200",
  },
  {
    type: "item", label: "Overhead", subLabel: "Taxes", href: "/overhead", icon: Receipt,
    iconActive: "text-red-300", iconInactive: "text-red-400/50", borderActive: "border-l-red-400", textActive: "text-red-200",
  },
  {
    type: "item", label: "Forecast", href: "/forecast", icon: TrendingUp,
    iconActive: "text-violet-300", iconInactive: "text-violet-400/50", borderActive: "border-l-violet-400", textActive: "text-violet-200",
  },
  {
    type: "item", label: "Reports", href: "/reports", icon: FileText,
    iconActive: "text-sky-300", iconInactive: "text-sky-400/50", borderActive: "border-l-sky-400", textActive: "text-sky-200",
  },
  // ── CRM ────────────────────────────────────────────────────────
  { type: "header", label: "CRM" },
  {
    type: "item", label: "CRM", href: "/crm", icon: Users,
    iconActive: "text-teal-300", iconInactive: "text-teal-400/50", borderActive: "border-l-teal-400", textActive: "text-teal-200",
  },
  {
    type: "item", label: "Flight Control", href: "/flight-control", icon: Sparkles,
    iconActive: "text-fuchsia-300", iconInactive: "text-fuchsia-400/50", borderActive: "border-l-fuchsia-400", textActive: "text-fuchsia-200",
  },
  // Inbox and Referrals hidden until fully built
  // {
  //   type: "item", label: "Inbox", href: "/inbox", icon: Inbox,
  //   iconActive: "text-rose-300", iconInactive: "text-rose-400/50", borderActive: "border-l-rose-400", textActive: "text-rose-200",
  // },
  // {
  //   type: "item", label: "Referrals", href: "/referrals", icon: Handshake,
  //   iconActive: "text-lime-300", iconInactive: "text-lime-400/50", borderActive: "border-l-lime-400", textActive: "text-lime-200",
  // },
  // ── TOOLS ──────────────────────────────────────────────────────
  { type: "header", label: "TOOLS" },
  {
    type: "item", label: "Social", href: "/social", icon: Share2,
    iconActive: "text-pink-300", iconInactive: "text-pink-400/50", borderActive: "border-l-pink-400", textActive: "text-pink-200",
  },
  {
    type: "item", label: "Guide", href: "/guide", icon: BookOpen,
    iconActive: "text-indigo-300", iconInactive: "text-indigo-400/50", borderActive: "border-l-indigo-400", textActive: "text-indigo-200",
    dataTour: "guide-link",
  },
  {
    type: "item", label: "Open House", subLabel: "Sign-In Page", href: "/open-house-setup", icon: Home,
    iconActive: "text-emerald-300", iconInactive: "text-emerald-400/50", borderActive: "border-l-emerald-400", textActive: "text-emerald-200",
  },
];


export function SidebarNav({
  isPro = false,
  orgContext = null,
}: {
  isPro?: boolean;
  orgContext?: OrgContext | null;
}) {
  const pathname = usePathname();

  // Build org-specific sidebar entries dynamically
  const orgEntries: SidebarEntry[] = orgContext
    ? [
        { type: "header", label: "YOUR TEAM" },
        {
          type: "item",
          label: orgContext.org.name.length > 18
            ? orgContext.org.name.slice(0, 16) + "…"
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
              {
                type: "item" as const,
                label: "Recruiting",
                href: "/org/recruit",
                icon: UserPlus,
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
  const allEntries: SidebarEntry[] = [];
  for (const entry of sidebarEntries) {
    allEntries.push(entry);
    // Insert org entries after the last CRM item (Flight Control)
    if (entry.type === "item" && entry.href === "/flight-control") {
      allEntries.push(...orgEntries);
    }
  }

  return (
    <aside
      data-tour="sidebar"
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
          <Image src="/logo.png" alt="Agent Runway" width={46} height={46} className="rounded-lg" />
        </div>
        <div>
          <span className="block text-[18.5px] font-bold tracking-tight text-sidebar-foreground">
            Agent Runway
          </span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/35">
            Business Analytics
          </span>
        </div>
      </div>

      {/* Separator with subtle fade */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-sidebar-border/70 to-transparent" />

      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          {allEntries.map((entry, i) => {
            if (entry.type === "header") {
              return (
                <div key={entry.label} className={cn("px-3 pb-1", i === 0 ? "pt-0" : "pt-4")}>
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/35">
                    {entry.label}
                  </span>
                </div>
              );
            }
            const isActive = pathname === entry.href || pathname.startsWith(entry.href + "/");
            return (
              <Link
                key={entry.href}
                href={entry.href}
                data-tour={entry.dataTour}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15.5px] transition-all duration-150 border-l-[3px]",
                  isActive
                    ? cn(
                        "bg-sidebar-accent font-semibold shadow-sm",
                        entry.textActive ?? "text-sidebar-accent-foreground",
                        entry.borderActive,
                      )
                    : "border-l-transparent font-medium text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground hover:border-l-sidebar-border",
                )}
              >
                <entry.icon
                  className={cn(
                    "h-[19px] w-[19px] shrink-0 transition-colors duration-150",
                    isActive ? entry.iconActive : entry.iconInactive,
                  )}
                />
                <span className="tracking-[0.015em] flex items-baseline gap-1.5">
                  {entry.label}
                  {entry.subLabel && (
                    <span className="text-[10px] font-normal text-sidebar-foreground/35 tracking-normal">
                      ({entry.subLabel})
                    </span>
                  )}
                </span>
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

      {/* Support contact + Visit marketing site.
          Support is a plain mailto: so it works without any in-app form —
          beta users (Ellis Realty) need a human-reachable escape hatch. */}
      <div className="px-3 pb-3 space-y-1">
        <a
          href="mailto:support@agentrunway.ca"
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
        >
          <LifeBuoy className="h-3.5 w-3.5 shrink-0" />
          Contact Support
        </a>
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
