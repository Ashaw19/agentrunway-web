/**
 * Sparkline — Tiny inline trend chart for dashboard metric cards.
 * Draws an animated SVG path from data points. Shows trend at a glance.
 */

import React, { useEffect } from "react";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface SparklineProps {
  /** Data points (at least 2) */
  data: number[];
  /** Width of the sparkline */
  width?: number;
  /** Height of the sparkline */
  height?: number;
  /** Stroke color */
  color?: string;
  /** Show gradient fill under the line */
  fill?: boolean;
  /** Stroke width */
  strokeWidth?: number;
}

function buildPath(
  data: number[],
  width: number,
  height: number,
  padding: number = 2
): { linePath: string; fillPath: string } {
  if (data.length < 2) return { linePath: "", fillPath: "" };

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / (data.length - 1);

  const points = data.map((val, i) => ({
    x: padding + i * stepX,
    y: padding + (1 - (val - min) / range) * (height - padding * 2),
  }));

  // Smooth curve through points using cubic bezier
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    linePath += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  // Fill path closes to bottom
  const lastPoint = points[points.length - 1];
  const fillPath = `${linePath} L ${lastPoint.x} ${height} L ${points[0].x} ${height} Z`;

  return { linePath, fillPath };
}

export function Sparkline({
  data,
  width = 80,
  height = 28,
  color = "#10B981",
  fill = true,
  strokeWidth = 1.5,
}: SparklineProps) {
  const progress = useSharedValue(0);
  const { linePath, fillPath } = buildPath(data, width, height);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [data, progress]);

  const animatedLineProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - progress.value) * 200,
  }));

  const animatedFillProps = useAnimatedProps(() => ({
    opacity: progress.value * 0.15,
  }));

  if (data.length < 2 || !linePath) return null;

  const id = `sparkGrad_${color.replace("#", "")}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {fill && (
        <AnimatedPath
          d={fillPath}
          fill={`url(#${id})`}
          animatedProps={animatedFillProps}
        />
      )}
      <AnimatedPath
        d={linePath}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={200}
        animatedProps={animatedLineProps}
      />
    </Svg>
  );
}

export default Sparkline;
