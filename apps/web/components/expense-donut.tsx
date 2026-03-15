"use client";

import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { fmtCurrency } from "@/lib/formatters";

export interface DonutDataPoint {
  name: string;
  value: number;
}

const COLORS = [
  "oklch(0.72 0.19 55)",     // amber      — primary expense colour
  "oklch(0.62 0.16 195)",    // teal       — second category
  "oklch(0.58 0.22 285)",    // violet     — third category
  "oklch(0.65 0.22 15)",     // rose       — fourth category
  "oklch(0.56 0.235 261)",   // brand blue — fifth category
  "oklch(0.65 0.18 150)",    // emerald    — sixth category
  "oklch(0.78 0.16 85)",     // golden     — seventh category
  "oklch(0.62 0.2 310)",     // purple     — eighth category
];

interface Props {
  data: DonutDataPoint[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{payload[0].name}</p>
      <p className="text-muted-foreground">{fmtCurrency(payload[0].value)}</p>
    </div>
  );
}

export function ExpenseDonut({ data }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const nonEmpty = data.filter((d) => d.value > 0);

  if (!mounted) {
    return <div className="h-[220px] animate-pulse rounded-lg bg-muted" />;
  }

  if (nonEmpty.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No expenses recorded yet
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Donut chart */}
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={nonEmpty}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
          >
            {nonEmpty.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-col justify-center gap-2">
        {nonEmpty.map((item, index) => (
          <div key={item.name} className="flex items-center gap-2 text-xs">
            <div
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="flex-1 truncate text-muted-foreground">
              {item.name}
            </span>
            <span className="font-medium">{fmtCurrency(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
