import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const { email, source = "website" } = (await request.json()) as {
    email: string;
    source?: string;
  };

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }

  // Use the service-role key so we can bypass RLS on email_signups
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("email_signups")
    .upsert({ email: email.toLowerCase().trim(), source }, { onConflict: "email" });

  if (error) {
    console.error("[subscribe] upsert error:", error.message);
    return NextResponse.json(
      { error: "Could not save your email. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
