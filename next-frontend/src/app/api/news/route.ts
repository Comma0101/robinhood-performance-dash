import { NextResponse } from "next/server";
import { fetchNewsAndSocial } from "@/lib/news";
import { NewsFeedPayload } from "@/types/ai";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get("tickers") ?? "";
  const limitParam = searchParams.get("limit");
  const socialLimitParam = searchParams.get("socialLimit");

  const tickers = tickersParam
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);

  const newsLimit = limitParam ? Number(limitParam) : undefined;
  const socialLimit = socialLimitParam ? Number(socialLimitParam) : undefined;

  try {
    const { news, social } = await fetchNewsAndSocial(tickers, {
      newsLimit: newsLimit && !Number.isNaN(newsLimit) ? newsLimit : undefined,
      socialLimit:
        socialLimit && !Number.isNaN(socialLimit) ? socialLimit : undefined,
    });

    const payload: NewsFeedPayload = {
      news,
      social,
      fetchedAtISO: new Date().toISOString(),
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("Failed to fetch news feed", error);
    return NextResponse.json(
      {
        error: "Unable to fetch news and social feed at this time.",
      },
      { status: 500 }
    );
  }
}

