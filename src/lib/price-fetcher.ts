import { supabase } from "./supabase";
import type { Card, PriceCache } from "./types";

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function getCachedPrices(cardId: string): Promise<PriceCache[]> {
  const { data } = await supabase
    .from("price_cache")
    .select("*")
    .eq("card_id", cardId)
    .order("fetched_at", { ascending: false });
  return (data as PriceCache[]) || [];
}

export interface RefreshContext {
  gradingCompany?: string;
  grade?: number | string;
}

export async function getPricesWithRefresh(
  cardId: string,
  force = false,
  context?: RefreshContext
): Promise<PriceCache[]> {
  if (!force) {
    const cached = await getCachedPrices(cardId);
    if (cached.length > 0) {
      const newest = new Date(cached[0].fetched_at).getTime();
      if (Date.now() - newest < CACHE_DURATION_MS) {
        return cached;
      }
    }
  }

  // Fetch the card to know which API to query
  const { data: card } = await supabase
    .from("cards")
    .select("*")
    .eq("id", cardId)
    .single();
  if (!card) return [];

  const freshPrices = await fetchPricesFromSource(card as Card, context);

  // Archive old prices to history before overwriting
  if (freshPrices.length > 0) {
    const { data: oldPrices } = await supabase
      .from("price_cache")
      .select("card_id, source, price_usd, condition_key")
      .eq("card_id", cardId);
    if (oldPrices && oldPrices.length > 0) {
      await supabase.from("price_history").insert(
        oldPrices.map((p: { card_id: string; source: string; price_usd: number | null; condition_key: string | null }) => ({
          card_id: p.card_id,
          source: p.source,
          price_usd: p.price_usd,
          condition_key: p.condition_key,
        }))
      );
    }
    await supabase.from("price_cache").delete().eq("card_id", cardId);
    await supabase.from("price_cache").insert(freshPrices);
  }

  return (await getCachedPrices(cardId)) || freshPrices;
}

async function fetchPricesFromSource(
  card: Card,
  context?: RefreshContext
): Promise<Omit<PriceCache, "id" | "fetched_at">[]> {
  switch (card.external_source) {
    case "pokemontcg":
      return fetchPokemonPrices(card);
    case "scryfall":
      return fetchScryfallPrices(card);
    case "ygoprodeck":
      return fetchYugiohPrices(card);
    case "thesportsdb":
      return fetchEbaySportsPrice(card, context);
    default:
      return [];
  }
}

async function fetchPokemonPrices(
  card: Card
): Promise<Omit<PriceCache, "id" | "fetched_at">[]> {
  if (!card.external_id) return [];
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards/${card.external_id}`,
    { headers: { "X-Api-Key": process.env.POKEMON_TCG_API_KEY || "" } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const prices: Omit<PriceCache, "id" | "fetched_at">[] = [];
  const tcgPrices = data.data?.tcgplayer?.prices;
  if (tcgPrices) {
    for (const [key, val] of Object.entries(
      tcgPrices as Record<string, Record<string, number>>
    )) {
      if (val.market)
        prices.push({
          card_id: card.id,
          source: "tcgplayer",
          price_usd: val.market,
          condition_key: `${key}_market`,
        });
    }
  }
  return prices;
}

async function fetchScryfallPrices(
  card: Card
): Promise<Omit<PriceCache, "id" | "fetched_at">[]> {
  if (!card.external_id) return [];
  const res = await fetch(
    `https://api.scryfall.com/cards/${card.external_id}`,
    { headers: { "User-Agent": "CardVault/1.0" } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const prices: Omit<PriceCache, "id" | "fetched_at">[] = [];
  if (data.prices?.usd)
    prices.push({
      card_id: card.id,
      source: "scryfall",
      price_usd: parseFloat(data.prices.usd),
      condition_key: "market",
    });
  if (data.prices?.usd_foil)
    prices.push({
      card_id: card.id,
      source: "scryfall",
      price_usd: parseFloat(data.prices.usd_foil),
      condition_key: "foil",
    });
  return prices;
}

async function fetchYugiohPrices(
  card: Card
): Promise<Omit<PriceCache, "id" | "fetched_at">[]> {
  if (!card.external_id) return [];
  const res = await fetch(
    `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${card.external_id}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  const prices: Omit<PriceCache, "id" | "fetched_at">[] = [];
  const p = data.data?.[0]?.card_prices?.[0];
  if (p) {
    if (p.tcgplayer_price && parseFloat(p.tcgplayer_price) > 0)
      prices.push({
        card_id: card.id,
        source: "tcgplayer",
        price_usd: parseFloat(p.tcgplayer_price),
        condition_key: "market",
      });
    if (p.cardmarket_price && parseFloat(p.cardmarket_price) > 0)
      prices.push({
        card_id: card.id,
        source: "cardmarket",
        price_usd: parseFloat(p.cardmarket_price),
        condition_key: "market",
      });
  }
  return prices;
}

// eBay Browse API pricing for sports cards (refresh)
async function fetchEbaySportsPrice(
  card: Card,
  context?: RefreshContext
): Promise<Omit<PriceCache, "id" | "fetched_at">[]> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  try {
    const tokenRes = await fetch(
      "https://api.ebay.com/identity/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
      }
    );
    if (!tokenRes.ok) return [];
    const tokenData = await tokenRes.json();

    // Build a specific search query from card details
    const parts: string[] = [];
    if (card.year) parts.push(String(card.year));
    if (card.set_name) parts.push(card.set_name);
    parts.push(card.name);
    if (card.card_number) parts.push(`#${card.card_number}`);
    if (card.rarity) parts.push(card.rarity);
    if (context?.gradingCompany) {
      parts.push(String(context.gradingCompany));
      if (context.grade) parts.push(String(context.grade));
    }
    if (!card.set_name) parts.push("card");

    const browseRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(parts.join(" "))}&category_ids=261328&filter=buyingOptions:{FIXED_PRICE},deliveryCountry:US&sort=price&limit=25`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    if (!browseRes.ok) return [];
    const browseData = await browseRes.json();

    const listings = browseData.itemSummaries || [];
    const listingPrices: number[] = listings
      .map(
        (item: { price?: { value?: string } }) =>
          item.price?.value ? parseFloat(item.price.value) : null
      )
      .filter((p: number | null): p is number => p !== null && p > 0)
      .sort((a: number, b: number) => a - b);

    if (listingPrices.length === 0) return [];

    // Floor-price model: lowest 5 BIN, 15% discount for market estimate
    // Low = actual lowest BIN (what you could buy it for right now)
    const DISCOUNT = 0.85;
    const floor = listingPrices.slice(0, 5);
    const floorMedian = floor[Math.floor(floor.length / 2)];
    const estimated = Math.round(floorMedian * DISCOUNT * 100) / 100;
    const low = listingPrices[0];
    const high = listingPrices[listingPrices.length - 1];

    const prices: Omit<PriceCache, "id" | "fetched_at">[] = [
      { card_id: card.id, source: "ebay", price_usd: estimated, condition_key: "market" },
      { card_id: card.id, source: "ebay", price_usd: low, condition_key: "low" },
      { card_id: card.id, source: "ebay", price_usd: high, condition_key: "high" },
    ];
    return prices;
  } catch {
    return [];
  }
}

export interface PriceRange {
  low: number | null;
  market: number | null;
  high: number | null;
}

export function getPriceRange(prices: PriceCache[]): PriceRange {
  const low = prices.find((p) => p.condition_key === "low")?.price_usd ?? null;
  const high = prices.find((p) => p.condition_key === "high")?.price_usd ?? null;
  const market = getAveragePrice(prices);
  return { low, market, high };
}

export function getAveragePrice(prices: PriceCache[]): number | null {
  const marketPrices = prices.filter(
    (p) =>
      p.price_usd !== null &&
      p.price_usd > 0 &&
      (p.condition_key === "market" ||
        p.condition_key === "normal_market" ||
        p.condition_key === "holofoil_market")
  );
  if (marketPrices.length === 0) {
    // Fallback: use any price
    const anyPrices = prices.filter(
      (p) => p.price_usd !== null && p.price_usd > 0
    );
    if (anyPrices.length === 0) return null;
    return (
      anyPrices.reduce((sum, p) => sum + (p.price_usd || 0), 0) /
      anyPrices.length
    );
  }
  return (
    marketPrices.reduce((sum, p) => sum + (p.price_usd || 0), 0) /
    marketPrices.length
  );
}
