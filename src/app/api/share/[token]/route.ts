import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface PriceRow {
  id: string;
  card_id: string;
  source: string;
  price_usd: number | null;
  condition_key: string | null;
  fetched_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Look up the share link
  const { data: link, error: linkError } = await supabase
    .from("share_links")
    .select("*")
    .eq("share_token", token)
    .single();

  if (linkError || !link) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  // Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Share link has expired" }, { status: 410 });
  }

  // Fetch collection items with filters
  let query = supabase
    .from("collection_items")
    .select("*, card:cards(*)")
    .order("date_added", { ascending: false });

  if (link.owner_filter) {
    query = query.eq("owner", link.owner_filter);
  }

  const { data: items, error: itemsError } = await query;
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let filtered: any[] = items || [];

  if (link.category_filter) {
    filtered = filtered.filter(
      (item: { card?: { category?: string } }) =>
        item.card?.category === link.category_filter
    );
  }

  // Fetch prices
  const cardIds = [...new Set(filtered.map((item: { card_id: string }) => item.card_id))];
  const { data: prices } = await supabase
    .from("price_cache")
    .select("*")
    .in("card_id", cardIds.length > 0 ? cardIds : ["__none__"]);

  const pricesByCard: Record<string, PriceRow[]> = {};
  for (const p of (prices || []) as PriceRow[]) {
    if (!pricesByCard[p.card_id]) pricesByCard[p.card_id] = [];
    pricesByCard[p.card_id].push(p);
  }

  const result = filtered.map((item: { card_id: string }) => ({
    ...item,
    prices: pricesByCard[item.card_id] || [],
  }));

  return NextResponse.json({
    items: result,
    owner_filter: link.owner_filter,
    category_filter: link.category_filter,
  });
}
