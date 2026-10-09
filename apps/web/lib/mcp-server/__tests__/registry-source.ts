/**
 * Reads the MCP server's real tool registry from the edge function SOURCE.
 *
 * WHY PARSE SOURCE (instead of importing buildToolRegistry):
 * `supabase/functions/mcp-server/tools/*.ts` use `npm:` specifiers and import
 * `../../_shared/core/...`, a path that only exists in the deployed bundle.
 * Neither vitest nor tsc can load them, and `supabase/functions` is excluded
 * from tsconfig. The registry is declared as literal objects, so a small
 * parser over the files is enough to recover each tool's name and its MCP
 * annotations.
 *
 * Composition mirrors `buildToolRegistry` in tools/index.ts: the inline tools
 * declared in index.ts (get_server_info), then every `...getXTools(...)`
 * spread, resolved through its `import { getXTools } from "./x.ts"` line.
 *
 * This is a test helper, not a test (no `.test.ts` suffix), so vitest only
 * runs it through the tests that import it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export const WEB_ROOT = path.resolve(__dirname, "../../..");
export const MCP_TOOLS_DIR = path.join(WEB_ROOT, "supabase/functions/mcp-server/tools");

export interface RegisteredTool {
  name: string;
  /** MCP `readOnlyHint`. Every registered tool must set it explicitly. */
  readOnly: boolean;
  /** MCP `destructiveHint`; per the MCP spec it defaults to true for non-read-only tools. */
  destructive: boolean;
}

// A tool literal always opens with `name: "<snake_case>",` followed by
// `description:`. Requiring both keeps nested `name:` fields (for example the
// `name: "Agent Runway"` inside get_server_info's payload) from matching.
const TOOL_HEAD = /\bname:\s*"([a-z][a-z0-9_]*)",\s*description:/g;

function readTool(file: string): string {
  return readFileSync(path.join(MCP_TOOLS_DIR, file), "utf8");
}

function parseToolsInSource(src: string, file: string): RegisteredTool[] {
  const heads = [...src.matchAll(TOOL_HEAD)];
  return heads.map((head, i) => {
    const name = head[1];
    const start = head.index ?? 0;
    const end = i + 1 < heads.length ? (heads[i + 1].index ?? src.length) : src.length;
    const body = src.slice(start, end);

    const annotations = body.match(/annotations:\s*\{([^}]*)\}/);
    if (!annotations) {
      throw new Error(`${file}: tool "${name}" has no annotations block`);
    }
    const readOnlyHint = annotations[1].match(/readOnlyHint:\s*(true|false)/);
    if (!readOnlyHint) {
      throw new Error(`${file}: tool "${name}" does not set readOnlyHint`);
    }
    const readOnly = readOnlyHint[1] === "true";
    const destructiveHint = annotations[1].match(/destructiveHint:\s*(true|false)/);
    const destructive = readOnly
      ? false
      : destructiveHint
        ? destructiveHint[1] === "true"
        : true;

    return { name, readOnly, destructive };
  });
}

/** Every tool `buildToolRegistry` returns, in registry order. */
export function readRegisteredTools(): RegisteredTool[] {
  const indexSrc = readTool("index.ts");

  const registryStart = indexSrc.indexOf("export function buildToolRegistry");
  if (registryStart === -1) {
    throw new Error("tools/index.ts: buildToolRegistry not found");
  }
  const registrySrc = indexSrc.slice(registryStart);

  const importFile = new Map<string, string>();
  for (const m of indexSrc.matchAll(/import\s*\{\s*(get\w+Tools)\s*\}\s*from\s*"\.\/([\w-]+\.ts)"/g)) {
    importFile.set(m[1], m[2]);
  }

  const tools = parseToolsInSource(registrySrc, "index.ts");
  for (const m of registrySrc.matchAll(/\.\.\.(get\w+Tools)\(/g)) {
    const file = importFile.get(m[1]);
    if (!file) {
      throw new Error(`tools/index.ts spreads ${m[1]} but no matching import was found`);
    }
    tools.push(...parseToolsInSource(readTool(file), file));
  }
  return tools;
}

/** The hand-written `available_tools` list that get_server_info reports to clients. */
export function readServerInfoToolNames(): string[] {
  const indexSrc = readTool("index.ts");
  const block = indexSrc.match(/available_tools:\s*\[([\s\S]*?)\]/);
  if (!block) {
    throw new Error("tools/index.ts: get_server_info available_tools list not found");
  }
  return [...block[1].matchAll(/"([a-z][a-z0-9_]*)"/g)].map((m) => m[1]);
}
