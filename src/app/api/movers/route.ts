import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { Mover } from "@/lib/types";

export const dynamic = "force-dynamic";

const MARKET_KEYS = ["market", "normal_market", "holofoil_market"];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const daysParam = parseInt(searchParams.get("days") || "7");
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 7;

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    // 1. Get all collection items with card info
    const { data: items, error: itemsErr } = await supabase
      .from("collection_items")
      .select("id, card_id, card:cards(name, image_url, category, set_name)");

    if (itemsErr) throw itemsErr;
    if (!items || items.length === 0) {
      return NextResponse.json({ gainers: [], losers: [] });
    }

    const cardIds = [...new Set(items.map((i: { card_id: string }) => i.card_id))];

    // 2. Get current market prices from price_cache
    const { data: currentPrices, error: pricesErr } = await supabase
      .from("price_cache")
      .select("card_id, price_usd, condition_key")
      .in("card_id", cardIds)
      .in("condition_key", MARKET_KEYS)
      .not("price_usd", "is", null);

    if (pricesErr) throw pricesErr;

    // Average current market price per card
    const currentByCard: Record<string, number> = {};
    const currentCounts: Record<string, number> = {};
    for (const p of currentPrices || []) {
      if (!p.price_usd || p.price_usd <= 0) continue;
      currentByCard[p.card_id] = (currentByCard[p.card_id] || 0) + p.price_usd;
      currentCounts[p.card_id] = (currentCounts[p.card_id] || 0) + 1;
    }
    for (const id of Object.keys(currentByCard)) {
      currentByCard[id] /= currentCounts[id];
    }

    // 3. Get historical prices within time window
    const { data: history, error: histErr } = await supabase
      .from("price_history")
      .select("card_id, price_usd, condition_key, recorded_at")
      .in("card_id", cardIds)
      .in("condition_key", MARKET_KEYS)
      .gte("recorded_at", since.toISOString())
      .not("price_usd", "is", null)
      .order("recorded_at", { ascending: true });

    if (histErr) throw histErr;

    // Take earliest day's prices per card as baseline
    const baselineByCard: Record<string, { total: number; count: number; date: string }> = {};
    for (const h of history || []) {
      if (!h.price_usd || h.price_usd <= 0) continue;
      const day = h.recorded_at.slice(0, 10); // YYYY-MM-DD
      if (!baselineByCard[h.card_id]) {
        baselineByCard[h.card_id] = { total: h.price_usd, count: 1, date: day };
      } else if (day === baselineByCard[h.card_id].date) {
        baselineByCard[h.card_id].total += h.price_usd;
        baselineByCard[h.card_id].count += 1;
      }
      // Skip later days — we only want the earliest
    }

    // Build movers, dedup by card_id (pick first collection item)
    const seenCards = new Set<string>();
    const movers: Mover[] = [];

    for (const item of items) {
      const cardId = item.card_id;
      if (seenCards.has(cardId)) continue;
      seenCards.add(cardId);

      const current = currentByCard[cardId];
      const baseline = baselineByCard[cardId];
      if (!current || !baseline) continue;

      const baselinePrice = baseline.total / baseline.count;
      if (baselinePrice <= 0) continue;

      const pctChange = ((current - baselinePrice) / baselinePrice) * 100;
      if (pctChange === 0) continue;

      // Supabase join returns an array for the relation; grab first element
      const cardRaw = item.card;
      const card = (Array.isArray(cardRaw) ? cardRaw[0] : cardRaw) as { name: string; image_url: string | null; category: string; set_name: string | null } | null;

      movers.push({
        collectionItemId: item.id,
        cardId,
        name: card?.name || "Unknown",
        setName: card?.set_name || null,
        imageUrl: card?.image_url || null,
        category: card?.category || "unknown",
        currentPrice: Math.round(current * 100) / 100,
        previousPrice: Math.round(baselinePrice * 100) / 100,
        pctChange: Math.round(pctChange * 10) / 10,
      });
    }

    movers.sort((a, b) => b.pctChange - a.pctChange);

    const gainers = movers.filter((m) => m.pctChange > 0).slice(0, 5);
    const losers = movers.filter((m) => m.pctChange < 0).slice(-5).reverse();

    return NextResponse.json({ gainers, losers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to compute movers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
