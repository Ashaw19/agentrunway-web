import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/chat/feedback
 *
 * Records thumbs-up / thumbs-down feedback on an AI response.
 * Updates the most recent chat_analytics row for this user that
 * matches the given topic + doesn't already have feedback.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { feedback } = body;

    if (feedback !== "positive" && feedback !== "negative") {
      return NextResponse.json(
        { error: "feedback must be 'positive' or 'negative'" },
        { status: 400 },
      );
    }

    // Find the most recent analytics row for this user/topic without feedback
    // and update it. This links the feedback to the correct interaction.
    const { error } = await supabase
      .from("chat_analytics")
      .update({ feedback })
      .eq("user_id", user.id)
      .is("feedback", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
