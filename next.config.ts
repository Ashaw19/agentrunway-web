import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent canvas-dependent packages from being bundled into the Node server
  // bundle — they are only ever used client-side via dynamic imports.
  serverExternalPackages: ["@react-pdf/renderer", "pdfjs-dist"],
};

export default nextConfig;
