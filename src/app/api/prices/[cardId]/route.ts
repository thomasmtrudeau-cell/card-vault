import { NextRequest, NextResponse } from "next/server";
import { getPricesWithRefresh } from "@/lib/price-fetcher";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  try {
    // Look up grading info from collection items for this card
    const { data: items } = await supabase
      .from("collection_items")
      .select("grading_company, grade")
      .eq("card_id", cardId)
      .eq("condition", "graded")
      .limit(1);
    const graded = items?.[0];
    const context = graded
      ? { gradingCompany: graded.grading_company, grade: graded.grade }
      : undefined;

    const prices = await getPricesWithRefresh(cardId, false, context);
    return NextResponse.json({ prices });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch prices" },
      { status: 500 }
    );
  }
}
