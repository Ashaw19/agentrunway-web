import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent @react-pdf/renderer (and its canvas/canvas-related deps) from being
  // bundled into the Node server bundle — it's only ever used client-side via
  // dynamic import inside a click handler.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
