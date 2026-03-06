import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPricesWithRefresh } from "@/lib/price-fetcher";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60s for bulk refresh

export async function POST() {
  try {
    // Get all unique card IDs from collection
    const { data: items, error } = await supabase
      .from("collection_items")
      .select("card_id, grading_company, grade, condition");

    if (error || !items) {
      return NextResponse.json({ error: "Failed to fetch collection" }, { status: 500 });
    }

    // Dedupe by card_id, keeping grading context
    const cardMap = new Map<string, { gradingCompany?: string; grade?: number }>();
    for (const item of items) {
      if (!cardMap.has(item.card_id)) {
        const context = item.condition === "graded"
          ? { gradingCompany: item.grading_company, grade: item.grade }
          : {};
        cardMap.set(item.card_id, context);
      }
    }

    let refreshed = 0;
    let failed = 0;

    // Refresh each card sequentially to avoid rate limits
    for (const [cardId, context] of cardMap) {
      try {
        await getPricesWithRefresh(cardId, true, context);
        refreshed++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ refreshed, failed, total: cardMap.size });
  } catch {
    return NextResponse.json({ error: "Failed to refresh prices" }, { status: 500 });
  }
}
