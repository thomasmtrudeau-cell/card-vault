import { NextRequest, NextResponse } from "next/server";
import { searchCards } from "@/lib/search-adapters";
import type { CardCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES: CardCategory[] = [
  "pokemon",
  "magic",
  "yugioh",
  "baseball",
  "football",
  "basketball",
  "hockey",
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") as CardCategory;
  const query = searchParams.get("q");

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  try {
    const results = await searchCards(category, query.trim());
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Search failed. Try again." },
      { status: 500 }
    );
  }
}
