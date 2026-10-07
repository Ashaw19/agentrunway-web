/**
 * Drift guard: public MCP claims must match the tools the server registers.
 *
 * The /mcp page, public/mcp-server.json, llms.txt and the registry-submission
 * doc said "16 read-only tools" for months after the server grew to 21 tools,
 * 4 of which write. This test reads the real registry from the edge function
 * source (see registry-source.ts) and fails when any public surface disagrees
 * on the tool list, the tool count, or which tools write.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_CATALOG, MCP_TOOL_COUNTS } from "../tool-catalog";
import { readRegisteredTools, readServerInfoToolNames, WEB_ROOT } from "./registry-source";

const registry = readRegisteredTools();
const total = registry.length;
const writeCount = registry.filter((t) => !t.readOnly).length;
const readCount = total - writeCount;
const byName = new Map(registry.map((t) => [t.name, t]));
const sortedNames = registry.map((t) => t.name).sort();

function readWeb(rel: string): string {
  return readFileSync(path.join(WEB_ROOT, rel), "utf8");
}

describe("MCP tool registry (parsed from the edge function source)", () => {
  it("finds the registered tools, with no duplicate names", () => {
    // Sanity floor so a parser regression can't silently produce an empty list.
    expect(total).toBeGreaterThan(10);
    expect(new Set(sortedNames).size).toBe(total);
  });

  it("get_server_info reports the same tool list to MCP clients", () => {
    expect(readServerInfoToolNames().sort()).toEqual(sortedNames);
  });
});

describe("public/mcp-server.json", () => {
  interface ManifestTool {
    name: string;
    read_only?: boolean;
    destructive?: boolean;
  }
  const manifest = JSON.parse(readWeb("public/mcp-server.json")) as {
    tools: ManifestTool[];
    tool_counts?: { total: number; read_only: number; write: number };
  };

  it("lists exactly the registered tools", () => {
    expect(manifest.tools.map((t) => t.name).sort()).toEqual(sortedNames);
  });

  it("marks each tool read_only and destructive to match its annotations", () => {
    for (const tool of manifest.tools) {
      const real = byName.get(tool.name);
      expect(real, tool.name).toBeDefined();
      expect({ name: tool.name, read_only: tool.read_only }).toEqual({
        name: tool.name,
        read_only: real?.readOnly,
      });
      expect({ name: tool.name, destructive: tool.destructive === true }).toEqual({
        name: tool.name,
        destructive: real?.destructive,
      });
    }
  });

  it("tool_counts matches the registry", () => {
    expect(manifest.tool_counts).toEqual({ total, read_only: readCount, write: writeCount });
  });
});

describe("tool catalog rendered on /mcp", () => {
  const catalogTools = MCP_TOOL_CATALOG.flatMap((g) => g.tools);

  it("lists exactly the registered tools", () => {
    expect(catalogTools.map((t) => t.name).sort()).toEqual(sortedNames);
  });

  it("labels read and write tools to match their annotations", () => {
    for (const tool of catalogTools) {
      const real = byName.get(tool.name);
      expect(real, tool.name).toBeDefined();
      expect({ name: tool.name, access: tool.access, destructive: tool.destructive === true }).toEqual({
        name: tool.name,
        access: real?.readOnly ? "read" : "write",
        destructive: real?.destructive,
      });
    }
  });

  it("MCP_TOOL_COUNTS matches the registry", () => {
    expect(MCP_TOOL_COUNTS).toEqual({ total, read: readCount, write: writeCount });
  });
});

// Count and read-only wording in public copy. Shared files (llms.txt, the
// JSON-LD feature list) also describe the in-app Flight Crew's tools, so only
// their lines that mention MCP are checked.
const COPY_SURFACES: Array<{ file: string; mcpLinesOnly: boolean }> = [
  { file: "app/mcp/page.tsx", mcpLinesOnly: false },
  { file: "app/oauth/consent/page.tsx", mcpLinesOnly: false },
  { file: "public/mcp-server.json", mcpLinesOnly: false },
  { file: "public/.well-known/mcp.json", mcpLinesOnly: false },
  { file: "../../docs/mcp-registry-submissions.md", mcpLinesOnly: false },
  { file: "public/llms.txt", mcpLinesOnly: true },
  { file: "lib/schema.ts", mcpLinesOnly: true },
];

function expectCount(file: string, claim: string, stated: string, actual: number) {
  expect({ file, claim, count: Number(stated) }).toEqual({ file, claim, count: actual });
}

describe("tool counts and read-only wording in public copy", () => {
  for (const { file, mcpLinesOnly } of COPY_SURFACES) {
    it(`${file} matches the registry`, () => {
      const raw = readWeb(file);
      const text = mcpLinesOnly
        ? raw.split("\n").filter((line) => /\bMCP\b/.test(line)).join("\n")
        : raw;

      // "21 tools", "21 MCP tools", "Tools (21 total)"
      for (const m of text.matchAll(/\b(\d+)\s+(?:MCP\s+)?tools\b/gi)) expectCount(file, m[0], m[1], total);
      for (const m of text.matchAll(/\btools\s*\((\d+)\s+total\)/gi)) expectCount(file, m[0], m[1], total);
      // "17 read-only", "17 read"
      for (const m of text.matchAll(/\b(\d+)\s+read(?:-only)?\b/gi)) expectCount(file, m[0], m[1], readCount);
      // "4 write"
      for (const m of text.matchAll(/\b(\d+)\s+write\b/gi)) expectCount(file, m[0], m[1], writeCount);
      // A blanket read-only claim ("(read-only)", "exposes read-only tools")
      // is false once any tool writes.
      if (writeCount > 0) {
        expect(text, `${file} calls MCP access read-only`).not.toMatch(/\(read-only\)/i);
        expect(text, `${file} calls the tools read-only without a count`).not.toMatch(
          /(?<!\d\s)\bread-only\s+(?:MCP\s+)?tools\b/i,
        );
      }
    });
  }
});
