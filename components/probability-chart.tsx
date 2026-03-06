"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtCompact, fmtCurrency } from "@/lib/formatters";

export interface ProbabilityDataPoint {
  label: string; // e.g. "Jan", "Feb" or year "2025"
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface Props {
  data: ProbabilityDataPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const map: Record<string, string> = {
    p90: "Best (P90)",
    p75: "Optimistic (P75)",
    p50: "Base (P50)",
    p25: "Conservative (P25)",
    p10: "Pessimistic (P10)",
  };
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{label}</p>
      {["p90", "p75", "p50", "p25", "p10"].map((key) => {
        const item = payload.find((p) => p.dataKey === key);
        if (!item) return null;
        return (
          <p
            key={key}
            className={
              key === "p50" ? "font-semibold text-foreground" : "text-muted-foreground"
            }
          >
            {map[key]}: {fmtCurrency(item.value)}
          </p>
        );
      })}
    </div>
  );
}

export function ProbabilityChart({ data }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-[200px] animate-pulse rounded-lg bg-muted" />;
  }

  // CSS custom property colour — follows the active theme token
  const c = "var(--chart-primary)";

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  style={{ stopColor: c, stopOpacity: 0.15 }} />
            <stop offset="95%" style={{ stopColor: c, stopOpacity: 0.02 }} />
          </linearGradient>
          <linearGradient id="innerFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   style={{ stopColor: c, stopOpacity: 0.18 }} />
            <stop offset="100%" style={{ stopColor: c, stopOpacity: 0.05 }} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground"
        />
        <YAxis
          tickFormatter={fmtCompact}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={52}
          className="fill-muted-foreground"
        />
        <Tooltip content={<CustomTooltip />} />

        {/* P10-P90 outer band */}
        <Area
          type="monotone"
          dataKey="p90"
          stroke={c}
          strokeWidth={1}
          strokeOpacity={0.3}
          fill="url(#bandFill)"
          fillOpacity={1}
        />
        <Area
          type="monotone"
          dataKey="p10"
          stroke={c}
          strokeWidth={1}
          strokeOpacity={0.3}
          fill="var(--background)"
          fillOpacity={1}
        />

        {/* P25-P75 inner band */}
        <Area
          type="monotone"
          dataKey="p75"
          stroke={c}
          strokeWidth={1.5}
          strokeOpacity={0.5}
          fill="url(#innerFill)"
          fillOpacity={1}
        />
        <Area
          type="monotone"
          dataKey="p25"
          stroke={c}
          strokeWidth={1.5}
          strokeOpacity={0.5}
          fill="var(--background)"
          fillOpacity={1}
        />

        {/* P50 median line */}
        <Area
          type="monotone"
          dataKey="p50"
          stroke={c}
          strokeWidth={2.5}
          fill="none"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
