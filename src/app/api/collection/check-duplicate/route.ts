import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const external_id = searchParams.get("external_id");
  const external_source = searchParams.get("external_source");
  const name = searchParams.get("name");
  const category = searchParams.get("category");

  try {
    let cardIds: string[] = [];

    if (external_id && external_source) {
      const { data: cards } = await supabase
        .from("cards")
        .select("id")
        .eq("external_id", external_id)
        .eq("external_source", external_source);
      cardIds = (cards || []).map((c: { id: string }) => c.id);
    } else if (name && category) {
      const { data: cards } = await supabase
        .from("cards")
        .select("id")
        .eq("name", name)
        .eq("category", category);
      cardIds = (cards || []).map((c: { id: string }) => c.id);
    }

    if (cardIds.length === 0) {
      return NextResponse.json({ exists: false, count: 0, owners: [] });
    }

    const { data: items } = await supabase
      .from("collection_items")
      .select("owner, quantity")
      .in("card_id", cardIds);

    if (!items || items.length === 0) {
      return NextResponse.json({ exists: false, count: 0, owners: [] });
    }

    const totalCount = items.reduce(
      (sum: number, i: { quantity: number }) => sum + (i.quantity || 1),
      0
    );
    const owners = [...new Set(items.map((i: { owner: string }) => i.owner))];

    return NextResponse.json({ exists: true, count: totalCount, owners });
  } catch {
    return NextResponse.json({ exists: false, count: 0, owners: [] });
  }
}
