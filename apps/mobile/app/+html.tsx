import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

/**
 * Root HTML document for the web export (Expo Router).
 *
 * This file controls the static <head> for every page in the web build.
 * It is rendered only on web during static export — it has no effect on
 * iOS / Android. Without an explicit <title> here, the document title
 * falls back to a generated value, which previously left a stale
 * placeholder ("SkillWin") in the deployed PWA. Pinning the title and PWA
 * meta here guarantees the export is always branded as Agent Runway.
 *
 * See: https://docs.expo.dev/router/reference/static-rendering/#root-html
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <title>Agent Runway</title>
        <meta
          name="description"
          content="Agent Runway — the business financial layer for Canadian real estate agents."
        />

        {/* PWA + theme branding */}
        <meta name="theme-color" content="#0A0A0F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Agent Runway" />
        <meta name="application-name" content="Agent Runway" />

        {/*
          Disable body scrolling on web. This makes ScrollView components
          work the same way they do on native. Keep this if you use
          ScrollView on web.
        */}
        <ScrollViewStyleReset />

        {/* Background colour matches the dark splash so there is no white
            flash before React mounts on web. */}
        <style dangerouslySetInnerHTML={{ __html: backgroundStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const backgroundStyle = `
html, body { background-color: #0A0A0F; }
`;
