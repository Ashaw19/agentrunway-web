import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const authorizationId = formData.get("authorization_id") as string | null;
  const decision = formData.get("decision") as string | null;

  if (!authorizationId || !decision) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authClient = supabase.auth as any;

    let redirectTo: string;

    if (decision === "allow") {
      const { data, error } = await authClient.oauth.approveAuthorization(authorizationId);
      if (error) throw error;
      redirectTo = data.redirect_to;
    } else {
      const { data, error } = await authClient.oauth.denyAuthorization(authorizationId);
      if (error) throw error;
      redirectTo = data.redirect_to;
    }

    return NextResponse.redirect(redirectTo);
  } catch (err) {
    console.error("[oauth/decision] Error processing authorization:", err);
    return NextResponse.json(
      { error: "Failed to process authorization. The request may have expired." },
      { status: 500 },
    );
  }
}
