import { fetchTweets } from "@/lib/twitter";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const handles = searchParams.get("handles")?.split(",");

  try {
    const social = await fetchTweets({
      limit: limit ? parseInt(limit, 10) : undefined,
      handles: handles,
    });
    return NextResponse.json({ social });
  } catch (error) {
    console.error("Error fetching twitter feed:", error);
    return NextResponse.json(
      { error: "Failed to fetch twitter feed" },
      { status: 500 }
    );
  }
}
