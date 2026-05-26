/**
 * ScoreBreakdownSheet — Tap the Runway Score to see the 5-component breakdown.
 * Reads component scores directly from the web dashboard's snapshot in Supabase.
 * No local recomputation — guaranteed parity with web.
 */

import { View, Text, type DimensionValue } from "react-native";
import {
  TrendingUp,
  Briefcase,
  Receipt,
  BarChart3,
  Shield,
} from "lucide-react-native";
import { Sheet } from "@/components/ui";
import { useColors, Space, Radius, Type } from "@/lib/theme";
import { useDataStore } from "@/stores/data-store";
import { bandColorHexForScore } from "@agent-runway/core/engines/runway-score-engine";

// Map component labels from the web snapshot to icons and colors
const COMPONENT_META: Record<
  string,
  { key: string; icon: typeof TrendingUp; color: string }
> = {
  "Goal Pace": { key: "pace", icon: TrendingUp, color: "#3B5EF6" },
  Pipeline: { key: "pipeline", icon: Briefcase, color: "#8B5CF6" },
  Expenses: { key: "expenses", icon: Receipt, color: "#10B981" },
  Benchmark: { key: "benchmark", icon: BarChart3, color: "#06B6D4" },
  Survival: { key: "survival", icon: Shield, color: "#8B5CF6" },
};

/**
 * Color band for a COMPONENT sub-score (Goal Pace, Pipeline, Expenses,
 * Benchmark, Survival — each 0-100). This is a DIFFERENT metric class from
 * the composite Runway Score; component bands have their own thresholds
 * (75/50/30) pending a formal scheme from `metrics-design-champion` (see
 * `memory/spec_runway_score_canonical_bands.md` §7 question 1).
 *
 * DO NOT use this for the composite score color — that must follow the
 * canonical stateLabel band via `bandColorHexForScore()` from the engine.
 */
function componentScoreColor(score: number): string {
  if (score >= 75) return "#10B981";
  if (score >= 50) return "#3B5EF6";
  if (score >= 30) return "#F59E0B";
  return "#EF4444";
}

export function ScoreBreakdownSheet({
  visible,
  onClose,
  totalScore,
}: {
  visible: boolean;
  onClose: () => void;
  totalScore: number;
}) {
  const c = useColors();
  const snapshot = useDataStore().settings?.runway_score_snapshot;
  const components = snapshot?.components ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} title="Runway Score Breakdown">
      {/* Overall score summary */}
      <View style={{ alignItems: "center", marginBottom: Space.xxl }}>
        <Text
          style={{
            fontSize: 48,
            fontWeight: "800",
            color: bandColorHexForScore(totalScore),
            letterSpacing: -1,
          }}
        >
          {totalScore}
        </Text>
        <Text style={{ ...Type.caption, color: c.textDim }}>out of 100</Text>
      </View>

      {/* Component rows — read from web snapshot */}
      {components.length > 0 ? (
        components.map((comp, idx) => {
          const meta = COMPONENT_META[comp.label] ?? {
            key: comp.label,
            icon: BarChart3,
            color: "#6366F1",
          };
          const Icon = meta.icon;
          const barWidth = Math.max(comp.score, 3);
          const weightPct = Math.round(comp.weight * 100);

          return (
            <View key={meta.key}>
              {idx > 0 && (
                <View
                  style={{
                    height: 1,
                    backgroundColor: c.divider,
                    marginVertical: Space.sm,
                  }}
                />
              )}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: Space.md,
                  paddingVertical: Space.sm,
                }}
              >
                {/* Icon */}
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: Radius.md,
                    backgroundColor: meta.color + "15",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 2,
                  }}
                >
                  <Icon size={18} color={meta.color} />
                </View>

                {/* Content */}
                <View style={{ flex: 1 }}>
                  {/* Label + weight + score */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: Space.sm,
                      }}
                    >
                      <Text style={{ ...Type.bodyBold, color: c.text }}>
                        {comp.label}
                      </Text>
                      <Text style={{ ...Type.micro, color: c.textDim }}>
                        {weightPct}%
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: componentScoreColor(comp.score),
                      }}
                    >
                      {comp.score}
                    </Text>
                  </View>

                  {/* Score bar */}
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: c.divider,
                      marginTop: Space.sm,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: 4,
                        borderRadius: 2,
                        width: `${barWidth}%` as DimensionValue,
                        backgroundColor: componentScoreColor(comp.score),
                      }}
                    />
                  </View>
                </View>
              </View>
            </View>
          );
        })
      ) : (
        <View style={{ alignItems: "center", paddingVertical: Space.xl }}>
          <Text style={{ ...Type.body, color: c.textDim, textAlign: "center" }}>
            Open the web dashboard to generate your score breakdown.
          </Text>
        </View>
      )}

      {/* Info */}
      <View
        style={{
          marginTop: Space.xl,
          backgroundColor: c.primaryDim,
          borderRadius: Radius.md,
          padding: Space.md,
          borderWidth: 1,
          borderColor: c.primaryBorder,
        }}
      >
        <Text
          style={{
            ...Type.caption,
            color: c.primaryLight,
            textAlign: "center",
          }}
        >
          Your Runway Score updates as you log deals, manage expenses, and grow
          your pipeline. Detailed analytics available on the web dashboard.
        </Text>
      </View>
    </Sheet>
  );
}
