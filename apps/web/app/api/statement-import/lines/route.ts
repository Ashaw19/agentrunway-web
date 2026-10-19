/**
 * POST /api/statement-import/lines: what the agent does with staged lines
 * on Expenses → Imports. Body: { action, ... }
 *
 *   confirm        { lines: [{ id, categoryKey? }] }  add to the expense records
 *                  (lines already on file are linked, never added twice)
 *   skip           { lineIds }                        not a business expense
 *   reopen         { lineIds }                        back to review
 *   category       { lineIds, categoryKey }           change the estimate
 *   not_duplicate  { lineIds }                        a different charge from the one on file
 *   match          { lineId, receiptId }              this receipt is this charge
 *   keep_both      { lineIds }                        a receipt saved later is a different charge
 *   remove         { statementId }                    remove the import (confirmed expenses stay)
 *
 * The caller's own client: row level security applies to everything.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  REFUSAL_COPY,
  confirmStatementLines,
  markNotDuplicate,
  keepLaterReceipt,
  matchReceiptToLine,
  removeStatement,
  reopenStatementLines,
  setStatementLinesCategory,
  skipStatementLines,
} from "@/lib/statement-import/server";
import { isReceiptCategoryKey } from "@/lib/types/receipt";

const ids = z.array(z.string().uuid()).min(1).max(2000);

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), lines: z.array(z.object({ id: z.string().uuid(), categoryKey: z.string().max(60).nullable().optional() })).min(1).max(2000) }),
  z.object({ action: z.literal("skip"), lineIds: ids }),
  z.object({ action: z.literal("reopen"), lineIds: ids }),
  z.object({ action: z.literal("category"), lineIds: ids, categoryKey: z.string().max(60) }),
  z.object({ action: z.literal("not_duplicate"), lineIds: ids }),
  z.object({ action: z.literal("match"), lineId: z.string().uuid(), receiptId: z.string().uuid() }),
  z.object({ action: z.literal("keep_both"), lineIds: ids }),
  z.object({ action: z.literal("remove"), statementId: z.string().uuid() }),
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    body = parsed.data;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "confirm": {
        const result = await confirmStatementLines(supabase, user.id, body.lines);
        return NextResponse.json({
          ok: true,
          ...result,
          refused: result.refused.map((r) => ({ ...r, message: REFUSAL_COPY[r.reason] })),
        });
      }
      case "skip":
        return NextResponse.json({ ok: true, updated: await skipStatementLines(supabase, user.id, body.lineIds) });
      case "reopen":
        return NextResponse.json({ ok: true, ...(await reopenStatementLines(supabase, body.lineIds)) });
      case "category":
        if (!isReceiptCategoryKey(body.categoryKey)) return NextResponse.json({ ok: false, error: REFUSAL_COPY.unknown_category }, { status: 400 });
        return NextResponse.json({ ok: true, updated: await setStatementLinesCategory(supabase, user.id, body.lineIds, body.categoryKey) });
      case "not_duplicate":
        return NextResponse.json({ ok: true, updated: await markNotDuplicate(supabase, user.id, body.lineIds) });
      case "match": {
        const result = await matchReceiptToLine(supabase, body.lineId, body.receiptId);
        if (!result.ok) return NextResponse.json({ ok: false, error: REFUSAL_COPY[result.reason], reason: result.reason }, { status: 409 });
        return NextResponse.json({ ok: true, replacedReceiptId: result.replacedReceiptId });
      }
      case "keep_both":
        return NextResponse.json({ ok: true, updated: await keepLaterReceipt(supabase, user.id, body.lineIds) });
      case "remove":
        return NextResponse.json({ ok: true, removed: await removeStatement(supabase, user.id, body.statementId) });
    }
  } catch (err) {
    console.error("[statement-import/lines]", body.action, err instanceof Error ? err.message.slice(0, 80) : "");
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
