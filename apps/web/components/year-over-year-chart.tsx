"use client";

import { useState, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { fmtCompact, fmtCurrency } from "@/lib/formatters";

export interface YoYDataPoint {
  year: number;
  gci: number;
  deals: number;
  /** Mark the current (partial) year differently */
  isCurrentYear?: boolean;
}

interface TooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string | number;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const gciItem = payload.find((p) => p.name === "GCI");
  const dealsItem = payload.find((p) => p.name === "Deals");
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      {gciItem && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: gciItem.color }}
          />
          GCI: <span className="font-medium text-foreground">{fmtCurrency(gciItem.value)}</span>
        </p>
      )}
      {dealsItem && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: dealsItem.color }}
          />
          Deals: <span className="font-medium text-foreground">{dealsItem.value}</span>
        </p>
      )}
    </div>
  );
}

interface Props {
  data: YoYDataPoint[];
  height?: number;
}

export function YearOverYearChart({ data, height = 260 }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className="animate-pulse rounded-lg bg-muted"
        style={{ height }}
      />
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No historical data to display
      </div>
    );
  }

  const GCI_COLOR = "#1E72F2";
  const GCI_DIM = "#93b8f9";
  const DEALS_COLOR = "#F0A800";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
        />
        {/* Left Y-axis — GCI */}
        <YAxis
          yAxisId="gci"
          orientation="left"
          tickFormatter={fmtCompact}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        {/* Right Y-axis — Deals */}
        <YAxis
          yAxisId="deals"
          orientation="right"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value: string) => (
            <span style={{ color: "var(--muted-foreground)" }}>{value}</span>
          )}
        />
        <Bar
          yAxisId="gci"
          dataKey="gci"
          name="GCI"
          radius={[4, 4, 0, 0]}
          maxBarSize={52}
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.isCurrentYear ? GCI_DIM : GCI_COLOR}
            />
          ))}
        </Bar>
        <Line
          yAxisId="deals"
          type="monotone"
          dataKey="deals"
          name="Deals"
          stroke={DEALS_COLOR}
          strokeWidth={2.5}
          dot={{ r: 4, fill: DEALS_COLOR, strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
