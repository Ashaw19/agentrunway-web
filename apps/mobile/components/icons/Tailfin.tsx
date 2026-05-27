/**
 * apps/mobile/components/icons/Tailfin.tsx
 *
 * Mobile RN-SVG port of the AR Tailfin brand mark used as the Captain
 * persona icon. Mirrors `apps/web/components/icons/brand-icons.tsx`
 * Tailfin component — same paths, same 24x24 viewBox — so the visual
 * identity matches the web experience.
 *
 * API matches lucide-react-native icons (`size`, `color`, `strokeWidth`)
 * so it drops in wherever a `LucideIcon` is expected on mobile.
 */

import { forwardRef } from "react";
import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";

export interface TailfinProps extends SvgProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * Tailfin is `forwardRef`-wrapped so it is structurally compatible with
 * lucide-react-native's `LucideIcon` shape (ForwardRefExoticComponent).
 * That lets `PersonaMeta.icon` accept both Tailfin and any lucide icon
 * without a discriminated union.
 */
export const Tailfin = forwardRef<React.ComponentRef<typeof Svg>, TailfinProps>(
  function Tailfin(
    { size = 24, color = "currentColor", strokeWidth = 2, ...rest },
    ref,
  ) {
    return (
      <Svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        <Path d="M4 20 L10 4 L20 4 L20 20 Z" />
        <Path d="M8 13 L20 13" />
      </Svg>
    );
  },
);
