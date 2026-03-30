/**
 * /api/social/publish
 *
 * Publishes a carousel post to Instagram via the Content Publishing API.
 *
 * POST body:
 *   slideUrls   string[]   — absolute public URLs of 1080×1080 slide images
 *   caption     string     — post caption text
 *
 * Flow:
 *   1. Look up the user's Instagram access token + account ID
 *   2. Create an IG media container for each slide (is_carousel_item=true)
 *   3. Create a carousel container referencing all children + caption
 *   4. Publish the carousel
 *   5. Record the post in social_posts table
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Allow up to 45 seconds for Instagram media container creation + polling
export const maxDuration = 45;

const IG_GRAPH = "https://graph.instagram.com/v21.0";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Sandbox guard ────────────────────────────────────────────────────────
  const { data: sandboxCheck } = await supabase.from("user_settings").select("sandbox_mode").eq("user_id", user.id).single();
  if (sandboxCheck?.sandbox_mode === true) {
    return NextResponse.json({ error: "Action blocked in Sandbox Mode" }, { status: 403 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  const body = (await req.json()) as {
    slideUrls?: string[];
    caption?: string;
    month?: number;
    year?: number;
    templateStyle?: string;
    transactionIds?: string[];
  };

  const { slideUrls, caption } = body;

  if (!slideUrls || slideUrls.length === 0) {
    return NextResponse.json({ error: "No slide URLs provided" }, { status: 400 });
  }

  if (slideUrls.length > 10) {
    return NextResponse.json({ error: "Instagram allows max 10 slides" }, { status: 400 });
  }

  // ── Get Instagram connection ────────────────────────────────────────────────
  const { data: connection } = await supabase
    .from("social_connections")
    .select("account_id, access_token, token_expires_at")
    .eq("user_id", user.id)
    .eq("platform", "instagram")
    .single();

  if (!connection?.access_token || !connection?.account_id) {
    return NextResponse.json(
      { error: "Instagram not connected. Please connect your account first." },
      { status: 400 },
    );
  }

  // Check token expiry
  if (connection.token_expires_at) {
    const expiresAt = new Date(connection.token_expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Instagram token has expired. Please reconnect your account." },
        { status: 401 },
      );
    }
  }

  const igUserId = connection.account_id;
  const accessToken = connection.access_token;

  try {
    // ── Step 1: Create a media container for each slide ───────────────────────
    const childIds: string[] = [];

    for (const imageUrl of slideUrls) {
      const res = await fetch(`${IG_GRAPH}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          is_carousel_item: true,
          access_token: accessToken,
        }),
      });

      const json = (await res.json()) as { id?: string; error?: { message: string } };

      if (!json.id) {
        throw new Error(
          `Failed to create media container: ${json.error?.message ?? "Unknown error"}`,
        );
      }

      childIds.push(json.id);
    }

    // ── Step 2: Create carousel container ─────────────────────────────────────
    const carouselRes = await fetch(`${IG_GRAPH}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption: caption ?? "",
        access_token: accessToken,
      }),
    });

    const carouselJson = (await carouselRes.json()) as {
      id?: string;
      error?: { message: string };
    };

    if (!carouselJson.id) {
      throw new Error(
        `Failed to create carousel: ${carouselJson.error?.message ?? "Unknown error"}`,
      );
    }

    // ── Step 3: Poll until container is ready, then publish ───────────────────
    const containerId = carouselJson.id;
    let published = false;
    let publishedId = "";

    // Wait briefly for processing, then try to publish
    for (let attempt = 0; attempt < 10; attempt++) {
      // Check container status
      const statusRes = await fetch(
        `${IG_GRAPH}/${containerId}?fields=status_code&access_token=${accessToken}`,
      );
      const statusJson = (await statusRes.json()) as {
        status_code?: string;
        error?: { message: string };
      };

      if (statusJson.status_code === "FINISHED") {
        // Publish
        const pubRes = await fetch(`${IG_GRAPH}/${igUserId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: containerId,
            access_token: accessToken,
          }),
        });

        const pubJson = (await pubRes.json()) as {
          id?: string;
          error?: { message: string };
        };

        if (!pubJson.id) {
          throw new Error(
            `Failed to publish: ${pubJson.error?.message ?? "Unknown error"}`,
          );
        }

        published = true;
        publishedId = pubJson.id;
        break;
      }

      if (statusJson.status_code === "ERROR") {
        throw new Error("Instagram rejected the carousel. Check image URLs and format.");
      }

      // Wait 2 seconds before checking again
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!published) {
      throw new Error("Carousel processing timed out. Try again in a moment.");
    }

    // ── Step 4: Record in social_posts ────────────────────────────────────────
    const { error: insertError } = await supabase.from("social_posts").insert({
      user_id: user.id,
      month: body.month,
      year: body.year,
      template_style: body.templateStyle ?? "classic",
      platform: "instagram",
      transaction_ids: body.transactionIds ?? [],
      caption: caption ?? "",
      status: "published",
      published_at: new Date().toISOString(),
    });
    if (insertError) console.error("[social] post record insert failed:", insertError);

    return NextResponse.json({
      success: true,
      postId: publishedId,
    });
  } catch (err) {
    console.error("[social/publish] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publishing failed" },
      { status: 500 },
    );
  }
}
