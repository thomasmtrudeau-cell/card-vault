import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "90");

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const { data, error } = await supabase
      .from("price_history")
      .select("*")
      .eq("card_id", cardId)
      .gte("recorded_at", since.toISOString())
      .order("recorded_at", { ascending: true });

    if (error) throw error;

    // Also include current price_cache as the latest data point
    const { data: current } = await supabase
      .from("price_cache")
      .select("card_id, source, price_usd, condition_key, fetched_at")
      .eq("card_id", cardId);

    return NextResponse.json({
      history: data || [],
      current: current || [],
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch price history" },
      { status: 500 }
    );
  }
}
