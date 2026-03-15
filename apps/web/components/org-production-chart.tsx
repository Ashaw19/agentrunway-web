"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtCompact, fmtCurrency } from "@/lib/formatters";
import type { OrgAgentPerformance } from "@/lib/types/organizations";

interface Props {
  agents: OrgAgentPerformance[];
}

interface ChartDatum {
  name: string;
  gci: number;
  pct: number;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: ChartDatum }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{d.name}</p>
      <p className="text-muted-foreground">
        {fmtCurrency(d.gci)} ({d.pct.toFixed(1)}% of total)
      </p>
    </div>
  );
}

export function OrgProductionChart({ agents }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const chartData = useMemo(() => {
    const sorted = [...agents].sort(
      (a, b) => Number(b.ytd_gci) - Number(a.ytd_gci),
    );
    const totalGCI = sorted.reduce((s, a) => s + Number(a.ytd_gci), 0);
    if (totalGCI === 0) return [];

    const toPct = (gci: number) => (gci / totalGCI) * 100;

    if (sorted.length <= 12) {
      return sorted.map((a) => ({
        name: a.agent_name,
        gci: Number(a.ytd_gci),
        pct: toPct(Number(a.ytd_gci)),
      }));
    }

    const top10 = sorted.slice(0, 10);
    const othersGCI = sorted
      .slice(10)
      .reduce((s, a) => s + Number(a.ytd_gci), 0);

    return [
      ...top10.map((a) => ({
        name: a.agent_name,
        gci: Number(a.ytd_gci),
        pct: toPct(Number(a.ytd_gci)),
      })),
      {
        name: `Others (${sorted.length - 10})`,
        gci: othersGCI,
        pct: toPct(othersGCI),
      },
    ];
  }, [agents]);

  if (!mounted) {
    return <div className="h-[280px] animate-pulse rounded-lg bg-muted" />;
  }

  if (chartData.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No production data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer
      width="100%"
      height={Math.max(200, chartData.length * 36)}
    >
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 4, right: 32, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-border"
          horizontal={false}
        />
        <XAxis
          type="number"
          tickFormatter={fmtCompact}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground"
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: "transparent" }}
        />
        <Bar
          dataKey="gci"
          radius={[0, 4, 4, 0]}
          maxBarSize={28}
          fill="var(--chart-primary)"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
