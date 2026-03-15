"use client";

import { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface CohortCounts {
  rookie: number;
  growth: number;
  established: number;
  topProducer: number;
}

interface Props {
  cohortCounts: CohortCounts;
}

interface DonutDatum {
  name: string;
  value: number;
}

const COHORT_COLORS = [
  "oklch(0.72 0.19 55)",   // amber   — rookie
  "oklch(0.62 0.16 195)",  // teal    — growth
  "oklch(0.58 0.22 285)",  // violet  — established
  "oklch(0.65 0.18 150)",  // emerald — top producer
];

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
      <p className="text-muted-foreground">
        {payload[0].value} agent{payload[0].value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function OrgCohortChart({ cohortCounts }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const data = useMemo<DonutDatum[]>(
    () => [
      { name: "Rookie (0\u20132 yr)", value: cohortCounts.rookie },
      { name: "Growth (2\u20135 yr)", value: cohortCounts.growth },
      { name: "Established (5\u201310 yr)", value: cohortCounts.established },
      { name: "Top Producer (10+ yr)", value: cohortCounts.topProducer },
    ],
    [cohortCounts],
  );

  const nonEmpty = data.filter((d) => d.value > 0);
  const total = nonEmpty.reduce((s, d) => s + d.value, 0);

  if (!mounted) {
    return <div className="h-[220px] animate-pulse rounded-lg bg-muted" />;
  }

  if (nonEmpty.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No agent experience data
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COHORT_COLORS[index % COHORT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex flex-col justify-center gap-2">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center gap-2 text-xs">
            <div
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: COHORT_COLORS[index] }}
            />
            <span className="flex-1 truncate text-muted-foreground">
              {item.name}
            </span>
            <span className="font-medium">
              {item.value}{" "}
              <span className="text-muted-foreground">
                ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
