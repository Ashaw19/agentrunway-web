import { NextRequest, NextResponse } from "next/server";
import { CREA_BOARDS, fetchBoardData } from "@/lib/crea-board";

// In-memory cache: board slug → { data, fetchedAt }
const cache = new Map<string, { data: object; fetchedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ board: string }> }
) {
  const { board: boardSlug } = await params;

  const board = CREA_BOARDS.find(
    (b) => b.slug === boardSlug || b.urlCode === boardSlug
  );

  if (!board) {
    return NextResponse.json({ error: "Unknown board" }, { status: 404 });
  }

  // Return from cache if fresh
  const cached = cache.get(board.slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
        "X-Cache": "HIT",
      },
    });
  }

  const data = await fetchBoardData(board);

  if (!data) {
    return NextResponse.json({ error: "Board data unavailable" }, { status: 503 });
  }

  cache.set(board.slug, { data, fetchedAt: Date.now() });

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      "X-Cache": "MISS",
    },
  });
}
