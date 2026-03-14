"use client";

import { useState } from "react";
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  BarChart3,
  Clock,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCurrency, fmtCompact } from "@/lib/formatters";
import type {
  Organization,
  OrganizationMember,
  OrgAgentPerformance,
} from "@/lib/types/organizations";
import { ORG_TYPE_LABELS } from "@/lib/types/organizations";

interface Props {
  org: Organization;
  membership: OrganizationMember;
  isAdmin: boolean;
  performance: OrgAgentPerformance[];
  activeMemberCount: number;
}

export function OrgDashboardContent({
  org,
  membership,
  isAdmin,
  performance,
  activeMemberCount,
}: Props) {
  const [showAnonymized, setShowAnonymized] = useState(org.anonymize_agents);

  // Aggregate stats
  const totalGCI = performance.reduce((sum, a) => sum + Number(a.ytd_gci), 0);
  const totalDeals = performance.reduce((sum, a) => sum + Number(a.deal_count), 0);
  const totalPipelineValue = performance.reduce(
    (sum, a) => sum + Number(a.pipeline_value),
    0,
  );
  const totalPipelineCount = performance.reduce(
    (sum, a) => sum + Number(a.pipeline_count),
    0,
  );
  const avgGCIPerAgent =
    activeMemberCount > 0 ? totalGCI / activeMemberCount : 0;

  // Apply anonymization for display
  const displayAgents = showAnonymized
    ? performance.map((a, i) => ({
        ...a,
        agent_name: `Agent ${String.fromCharCode(65 + (i % 26))}`,
        avatar_url: "",
      }))
    : performance;

  // Sort by YTD GCI descending
  const sortedAgents = [...displayAgents].sort(
    (a, b) => Number(b.ytd_gci) - Number(a.ytd_gci),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Building2 className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
          <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-500">
            {ORG_TYPE_LABELS[org.type]}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Organization performance dashboard
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={DollarSign}
          label="Total Org GCI"
          value={fmtCompact(totalGCI)}
          iconColor="text-emerald-500"
        />
        <KPICard
          icon={Users}
          label="Active Agents"
          value={String(activeMemberCount)}
          sub={`Avg ${fmtCurrency(avgGCIPerAgent)} / agent`}
          iconColor="text-blue-500"
        />
        <KPICard
          icon={BarChart3}
          label="Closed Deals"
          value={String(totalDeals)}
          iconColor="text-violet-500"
        />
        <KPICard
          icon={TrendingUp}
          label="Pipeline Value"
          value={fmtCompact(totalPipelineValue)}
          sub={`${totalPipelineCount} active deals`}
          iconColor="text-amber-500"
        />
      </div>

      {/* Agent Performance Table */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">Agent Performance</h2>
          {isAdmin && (
            <button
              onClick={() => setShowAnonymized(!showAnonymized)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAnonymized ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" /> Anonymized
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" /> Showing Names
                </>
              )}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Agent</th>
                <th className="px-5 py-3 text-right font-medium">YTD GCI</th>
                <th className="px-5 py-3 text-right font-medium">Deals</th>
                <th className="px-5 py-3 text-right font-medium">Pipeline</th>
                <th className="px-5 py-3 text-right font-medium">
                  Pipeline Value
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAgents.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-muted-foreground"
                  >
                    No active agents yet. Invite your team to get started.
                  </td>
                </tr>
              ) : (
                sortedAgents.map((agent) => (
                  <tr
                    key={agent.user_id}
                    className="border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {agent.avatar_url ? (
                          <img
                            src={agent.avatar_url}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 text-xs font-semibold text-orange-500">
                            {agent.agent_name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{agent.agent_name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {agent.role}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold">
                      {Number(agent.ytd_gci) > 0
                        ? fmtCurrency(Number(agent.ytd_gci))
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {Number(agent.deal_count) || "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {Number(agent.pipeline_count) || "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      {Number(agent.pipeline_value) > 0
                        ? fmtCurrency(Number(agent.pipeline_value))
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data privacy notice */}
      <p className="text-[10px] text-muted-foreground/60 italic leading-relaxed">
        This dashboard shows only Tier 1 metrics (GCI, deals, pipeline). Individual
        agent tax data, expense details, commission splits, and cash reserves are
        never accessible to organization administrators.
      </p>
    </div>
  );
}

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", iconColor)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      {sub && (
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      )}
    </div>
  );
}
