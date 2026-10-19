/**
 * Every dialog fits the window (2026-10-19). The transaction edit dialog ran
 * off the bottom of a laptop screen with its Save button out of reach, and
 * it would not scroll. 20 of the app's dialogs set no height of their own, so
 * the cap lives in the shared components: a dialog is never taller than the
 * window and scrolls inside itself. A dialog that sets its own height or
 * overflow still wins (tailwind-merge keeps the later class).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

const BASE_CAP = "max-h-[calc(100dvh-2rem)] overflow-y-auto";
const read = (f: string) => readFileSync(path.join(__dirname, "../../components/ui", f), "utf8");

describe("dialogs fit the window", () => {
  it.each(["dialog.tsx", "alert-dialog.tsx"])("%s caps its height and scrolls", (file) => {
    expect(read(file)).toContain(BASE_CAP);
  });

  it("a dialog's own height or overflow replaces the default", () => {
    expect(cn(BASE_CAP, "max-h-[90vh] overflow-y-auto")).toBe("max-h-[90vh] overflow-y-auto");
    expect(cn(BASE_CAP, "overflow-hidden p-0")).toBe("max-h-[calc(100dvh-2rem)] overflow-hidden p-0");
  });
});
