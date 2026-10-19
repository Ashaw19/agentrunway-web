/**
 * The slice of a Supabase client that core's writers use, typed structurally.
 *
 * Core files the MCP edge function imports (through its generated Deno copy,
 * scripts/build-mcp-shared.js) can't import "@supabase/supabase-js", even for
 * a type: the copy has no import map, so a bare specifier fails to load
 * (apps/web/lib/mcp-server/__tests__/deno-imports.test.ts). A web, phone or
 * edge SupabaseClient fits this type as it is.
 */

// The query builder is Supabase's own; its chain is not re-typed here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = { from: (table: string) => any };
