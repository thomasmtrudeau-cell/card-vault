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

  // Try to insert new prices first, only delete old ones if insert succeeds
  if (freshPrices.length > 0) {
    const { error: insertError } = await supabase.from("price_cache").insert(freshPrices);
    if (!insertError) {
      // Insert succeeded — now archive and delete old prices
      const { data: oldPrices } = await supabase
        .from("price_cache")
        .select("id, card_id, source, price_usd, condition_key")
        .eq("card_id", cardId);
      // Old prices = everything except the ones we just inserted (by fetched_at)
      const freshIds = new Set<string>();
      if (oldPrices) {
        // Sort by fetched_at desc, the newest N are our fresh ones
        const sorted = [...oldPrices].sort((a, b) => a.id > b.id ? -1 : 1);
        const freshOnes = sorted.slice(0, freshPrices.length);
        freshOnes.forEach((p) => freshIds.add(p.id));
        const stale = sorted.slice(freshPrices.length);
        if (stale.length > 0) {
          await supabase.from("price_history").insert(
            stale.map((p) => ({
              card_id: p.card_id,
              source: p.source,
              price_usd: p.price_usd,
              condition_key: p.condition_key,
            }))
          );
          await supabase
            .from("price_cache")
            .delete()
            .in("id", stale.map((p) => p.id));
        }
      }
    }
    // If insert failed (e.g. missing column), old prices remain untouched
  }

  return (await getCachedPrices(cardId)) || freshPrices;
}

const TCG_CATEGORIES = ["pokemon", "magic", "yugioh"];

async function fetchPricesFromSource(
  card: Card,
  context?: RefreshContext
): Promise<Omit<PriceCache, "id" | "fetched_at">[]> {
  switch (card.external_source) {
    case "pokemontcg":
      return fetchPokemonPrices(card);
    case "tcgdex":
      return fetchEbayTCGPrice(card);
    case "scryfall":
      return fetchScryfallPrices(card);
    case "ygoprodeck":
      return fetchYugiohPrices(card);
    case "thesportsdb":
      return fetchEbaySportsPrice(card, context);
    case "ebay":
      if (TCG_CATEGORIES.includes(card.category)) {
        return fetchEbayTCGPrice(card);
      }
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
          listing_url: null,
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
      listing_url: data.purchase_uris?.tcgplayer || null,
    });
  if (data.prices?.usd_foil)
    prices.push({
      card_id: card.id,
      source: "scryfall",
      price_usd: parseFloat(data.prices.usd_foil),
      condition_key: "foil",
      listing_url: data.purchase_uris?.tcgplayer || null,
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
        listing_url: null,
      });
    if (p.cardmarket_price && parseFloat(p.cardmarket_price) > 0)
      prices.push({
        card_id: card.id,
        source: "cardmarket",
        price_usd: parseFloat(p.cardmarket_price),
        condition_key: "market",
        listing_url: null,
      });
  }
  return prices;
}

interface EbayListing {
  title?: string;
  price?: { value?: string };
  itemWebUrl?: string;
}

const JUNK_PATTERNS = /you pick|pick your|choose your|complete your set|lot of|mystery|repack/i;
const DISCOUNT = 0.85;

function buildEbayPrices(
  cardId: string,
  rawListings: EbayListing[]
): Omit<PriceCache, "id" | "fetched_at">[] {
  const listings = rawListings.filter(
    (item) => !JUNK_PATTERNS.test(item.title || "")
  );

  // Build sorted price+url pairs
  const priced = listings
    .map((item) => ({
      price: item.price?.value ? parseFloat(item.price.value) : null,
      url: item.itemWebUrl || null,
    }))
    .filter((p): p is { price: number; url: string | null } => p.price !== null && p.price > 0)
    .sort((a, b) => a.price - b.price);

  if (priced.length === 0) return [];

  const lowest = priced[0];
  const medianItem = priced[Math.floor(priced.length / 2)];
  const highest = priced[priced.length - 1];

  return [
    {
      card_id: cardId,
      source: "ebay",
      price_usd: Math.round(lowest.price * DISCOUNT * 100) / 100,
      condition_key: "market",
      listing_url: lowest.url,
    },
    {
      card_id: cardId,
      source: "ebay",
      price_usd: Math.round(medianItem.price * DISCOUNT * 100) / 100,
      condition_key: "mid",
      listing_url: medianItem.url,
    },
    {
      card_id: cardId,
      source: "ebay",
      price_usd: Math.round(highest.price * DISCOUNT * 100) / 100,
      condition_key: "high",
      listing_url: highest.url,
    },
  ];
}

async function getEbayToken(): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

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
  if (!tokenRes.ok) return null;
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

// eBay Browse API pricing for Pokemon/TCG cards
async function fetchEbayTCGPrice(
  card: Card
): Promise<Omit<PriceCache, "id" | "fetched_at">[]> {
  try {
    const token = await getEbayToken();
    if (!token) return [];

    const parts: string[] = [];
    if (card.set_name) parts.push(card.set_name);
    parts.push(card.name);
    if (card.card_number) parts.push(`#${card.card_number}`);
    if (!card.set_name) parts.push("pokemon card");
    const query = parts.join(" ") + " -lot -break -box -pack -repack";

    const browseRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=183454&filter=buyingOptions:{FIXED_PRICE},deliveryCountry:US,price:[5..],priceCurrency:USD&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!browseRes.ok) return [];
    const browseData = await browseRes.json();

    return buildEbayPrices(card.id, browseData.itemSummaries || []);
  } catch {
    return [];
  }
}

// eBay Browse API pricing for sports cards
async function fetchEbaySportsPrice(
  card: Card,
  context?: RefreshContext
): Promise<Omit<PriceCache, "id" | "fetched_at">[]> {
  try {
    const token = await getEbayToken();
    if (!token) return [];

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
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(parts.join(" ") + " -lot -break -box -pack -repack")}&category_ids=261328&filter=buyingOptions:{FIXED_PRICE},deliveryCountry:US,price:[5..],priceCurrency:USD&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!browseRes.ok) return [];
    const browseData = await browseRes.json();

    return buildEbayPrices(card.id, browseData.itemSummaries || []);
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
  const market = getAveragePrice(prices);
  const mid = prices.find((p) => p.condition_key === "mid")?.price_usd ?? null;
  const high = prices.find((p) => p.condition_key === "high")?.price_usd ?? null;
  return { low: market, market: mid ?? market, high };
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
