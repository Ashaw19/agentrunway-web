"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

type Props = React.ComponentProps<typeof NextThemesProvider> & {
  children: React.ReactNode;
};

export function ThemeProvider({ children, ...props }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Provider = NextThemesProvider as any;
  return <Provider {...props}>{children}</Provider>;
}
