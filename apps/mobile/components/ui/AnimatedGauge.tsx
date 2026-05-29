/**
 * AnimatedGauge — the Runway Score cockpit instrument.
 *
 * Design POV: this is an aircraft altimeter / attitude gauge, not a generic
 * progress ring. On mount the arc *spins up* — it sweeps from 0 to the score
 * value while the centre number rolls up like a mechanical altimeter. A
 * gradient runs along the arc (band color → a deeper sibling) and a soft glow
 * in the band color sits behind it so the active reading reads "lit".
 *
 * Motion runs entirely on the UI thread via reanimated worklets:
 *  - arc sweep: animated `strokeDashoffset` on an AnimatedCircle
 *  - count-up:  animated `text` prop on an AnimatedTextInput (no JS setState loop)
 *
 * Reduced motion: when `useReducedMotion()` is true the gauge renders its final
 * state on the first frame — full arc, final number, no sweep, no roll-up.
 */

import React, { useEffect } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { shiftHex, shadows } from "@/lib/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
Animated.addWhitelistedNativeProps({ text: true });

const SWEEP_MS = 900;

export function AnimatedGauge({
  score,
  bandColor,
  textColor,
  dimColor,
  mode,
  size = 140,
  strokeWidth = 9,
}: {
  score: number;
  bandColor: string;
  textColor: string;
  dimColor: string;
  mode: "light" | "dark";
  size?: number;
  strokeWidth?: number;
}) {
  const reduceMotion = useReducedMotion();
  const safeScore = Math.max(0, Math.min(100, isFinite(score) ? score : 0));

  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  // Gradient sibling: deeper, slightly warmer-shifted band color so the arc
  // reads as a lit instrument needle, not a flat stroke. amber→deep-orange,
  // blue→deep-blue, etc. — always in-family with the canonical band color.
  const gradFrom = shiftHex(bandColor, 0.18);
  const gradTo = shiftHex(bandColor, -0.22);

  // Track ring — neutral on light (gold disappears on near-white hero card),
  // band-tinted on dark.
  const trackStroke = mode === "light" ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.08)";

  // 0..1 sweep progress. Drives both the arc offset and the count-up.
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: SWEEP_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [safeScore, reduceMotion, progress]);

  // Arc draws from 0 → score. strokeDashoffset = full circumference at p=0,
  // shrinking to the score's offset at p=1.
  const arcProps = useAnimatedProps(() => {
    const shown = safeScore * progress.value;
    return { strokeDashoffset: circ * (1 - shown / 100) };
  });

  // Count-up: animated integer text on the UI thread.
  const displayValue = useDerivedValue(() =>
    Math.round(safeScore * progress.value)
  );
  const numberProps = useAnimatedProps(() => {
    // `text` is whitelisted above so this writes straight to the native view.
    return { text: String(displayValue.value) } as object;
  });

  const glow = shadows(mode).glow(bandColor);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* Glow layer — a blurred shadow disc in the band color sits behind the
          arc so the instrument reads "active". Kept low-opacity so it does not
          turn muddy on the dark hero card. */}
      <View
        style={[
          {
            position: "absolute",
            width: size - strokeWidth * 2,
            height: size - strokeWidth * 2,
            borderRadius: size,
            backgroundColor: "transparent",
          },
          glow,
        ]}
      />
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="gaugeArc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradFrom} />
            <Stop offset="1" stopColor={gradTo} />
          </LinearGradient>
        </Defs>
        {/* Track ring */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={trackStroke}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated gradient arc */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={r}
          stroke="url(#gaugeArc)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circ}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          animatedProps={arcProps}
        />
      </Svg>
      {/* Centre readout — overlaid so we can use an AnimatedTextInput for the
          UI-thread count-up while keeping the "/100" static. */}
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
        <AnimatedTextInput
          editable={false}
          defaultValue={reduceMotion ? String(Math.round(safeScore)) : "0"}
          animatedProps={numberProps}
          style={{
            fontSize: 42,
            fontWeight: "800",
            color: textColor,
            padding: 0,
            margin: 0,
            textAlign: "center",
            minWidth: size,
            // Pull the static "/100" closer beneath the number.
            marginBottom: -8,
          }}
        />
        <Animated.Text style={{ fontSize: 13, fontWeight: "600", color: dimColor, marginTop: 2 }}>
          /100
        </Animated.Text>
      </View>
    </View>
  );
}

export default AnimatedGauge;
