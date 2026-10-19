/**
 * Live-model suites call Anthropic. They run only when ANTHROPIC_API_KEY is
 * set and skip cleanly otherwise (describe.skipIf), so a machine or CI job
 * without a key reports them as skipped, never failed.
 */
export const LIVE = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

/** Why a live suite was skipped, for its title. */
export const LIVE_SKIP_NOTE = LIVE ? "" : " (skipped: ANTHROPIC_API_KEY not set)";
