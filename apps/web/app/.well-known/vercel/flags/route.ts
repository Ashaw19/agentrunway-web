/**
 * Flags Discovery Endpoint
 *
 * Vercel Toolbar reads this endpoint to discover which feature flags exist
 * in the app, what their keys/options are, and to render override UI in
 * the toolbar overlay. The endpoint is auth-gated by the Flags SDK using
 * the `FLAGS_SECRET` env var (32-byte base64 string set in Vercel project
 * settings — generate with `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"`
 * or via the Vercel CLI: `vercel env pull` after enabling Flags in the
 * project).
 *
 * Path is fixed by the Flags SDK contract — do not move it.
 *
 * Docs: https://flags-sdk.dev/docs/api-reference/createFlagsDiscoveryEndpoint
 */

import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";
import {
  flightCrewEnabled,
  navigatorEnabled,
  dispatcherEnabled,
} from "@/lib/flags";

export const GET = createFlagsDiscoveryEndpoint(async () =>
  getProviderData({
    flightCrewEnabled,
    navigatorEnabled,
    dispatcherEnabled,
  }),
);
