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

  // Safely swap prices: get old IDs first, insert new, then clean up old
  if (freshPrices.length > 0) {
    // Snapshot old price IDs before inserting
    const { data: oldPrices } = await supabase
      .from("price_cache")
      .select("id, card_id, source, price_usd, condition_key")
      .eq("card_id", cardId);
    const oldIds = (oldPrices || []).map((p) => p.id);

    // Insert new prices
    const { error: insertError } = await supabase.from("price_cache").insert(freshPrices);
    if (!insertError && oldIds.length > 0) {
      // Archive old prices to history
      await supabase.from("price_history").insert(
        (oldPrices || []).map((p) => ({
          card_id: p.card_id,
          source: p.source,
          price_usd: p.price_usd,
          condition_key: p.condition_key,
        }))
      );
      // Delete old prices by their specific IDs
      await supabase.from("price_cache").delete().in("id", oldIds);
    }
    // If insert failed, old prices remain untouched
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
      return fetchEbayTCGPrice(card, context);
    case "scryfall":
      return fetchScryfallPrices(card);
    case "ygoprodeck":
      return fetchYugiohPrices(card);
    case "thesportsdb":
      return fetchEbaySportsPrice(card, context);
    case "ebay":
      if (TCG_CATEGORIES.includes(card.category)) {
        return fetchEbayTCGPrice(card, context);
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
  condition?: string; // e.g. "Graded - PSA 10", "Ungraded - Near mint or better"
}

interface FilterContext {
  gradingCompany?: string;
  grade?: number | string;
  edition?: string; // e.g. "1st edition" or empty for unlimited
  cardName?: string; // card/player name — listing title must contain this
}

const JUNK_PATTERNS = /you pick|pick your|choose your|complete your set|lot of|mystery|repack/i;
// Multi-card bulk listings: "44/46/63/102"
const BULK_PATTERNS = /\d+\/\d+\/\d+/;
// Non-English Pokemon cards (Japanese, Korean, Chinese, etc.)
// Includes Japanese set codes (SV2a, s12a, s8a, SM12a, etc.) and common JP indicators
const NON_ENGLISH_PATTERNS = /\bjapanese\b|\bjpn\b|\bjp\b|\bkorean\b|\bchinese\b|\bfrench\b|\bgerman\b|\bitalian\b|\bspanish\b|\bportuguese\b|\bdutch\b|\bsv2a\b|\bs\d+a\b|\bsm\d+a\b|\bxy\d+a\b|\bchi[-\s]?yu\b/i;
// Novelty/accessory items that aren't actual cards
const NOVELTY_PATTERNS = /\bkeychain\b|\bslabbie\b|\breplica\b|\bcustom\b|\bproxy\b|\bsticker\b|\bmagnet\b|\bpin\b|\bposter\b|\bdisplay\b|\bstand\b|\bfridge\b|\btoy\b|\bplush\b|\bfigur/i;
const DISCOUNT = 0.85;

// Grade values for comparison (higher = better)
const GRADE_VALUES: Record<string, number> = {
  "10": 10, "9.5": 9.5, "9": 9, "8.5": 8.5, "8": 8,
  "7.5": 7.5, "7": 7, "6.5": 6.5, "6": 6, "5": 5,
};

function isListingValid(listing: EbayListing, ctx?: FilterContext): boolean {
  const title = listing.title || "";
  if (!title) return false;
  const t = title.toLowerCase();

  // Filter junk patterns
  if (JUNK_PATTERNS.test(t)) return false;

  // Filter bulk/multi-card listings
  if (BULK_PATTERNS.test(title)) return false;

  // Filter non-English Pokemon cards
  if (NON_ENGLISH_PATTERNS.test(t)) return false;

  // Filter novelty/accessory items (keychains, replicas, etc.)
  if (NOVELTY_PATTERNS.test(t)) return false;

  // Listing title must contain the card/player name
  if (ctx?.cardName) {
    const nameLower = ctx.cardName.toLowerCase();
    if (!t.includes(nameLower)) return false;
  }

  // If card is NOT 1st edition, filter out 1st edition listings
  // (they're much more expensive and would inflate the price)
  if (ctx && !ctx.edition) {
    if (/1st\s*edition/i.test(t)) return false;
  }

  // If searching for graded cards, require eBay condition to start with "Graded"
  // "Ungraded - Near mint" contains "graded" as a substring, so we check the prefix
  if (ctx?.gradingCompany && listing.condition) {
    const cond = listing.condition.toLowerCase().trim();
    if (!cond.startsWith("graded")) return false;
  }

  // Grade + company validation: if searching for "PSA 10", require that
  // the listing title contains "PSA 10" specifically. Reject listings
  // graded by a different company (e.g. "CGC 10" when looking for PSA 10)
  // since cross-company prices differ significantly.
  if (ctx?.gradingCompany && ctx?.grade) {
    const targetCompany = ctx.gradingCompany.toLowerCase();
    const targetGrade = parseFloat(String(ctx.grade));
    if (!isNaN(targetGrade)) {
      // Check if the listing mentions our exact company + grade
      const exactPattern = new RegExp(
        `\\b${targetCompany}\\s*${targetGrade}\\b`,
        "i"
      );
      const hasExactMatch = exactPattern.test(t);

      // Check if a DIFFERENT grading company is the primary grader
      const allCompanies = ["psa", "bgs", "cgc", "sgc"];
      const otherCompanies = allCompanies.filter((c) => c !== targetCompany);
      const otherPattern = new RegExp(
        `\\b(?:${otherCompanies.join("|")})\\s*\\d+(?:\\.\\d+)?\\b`,
        "i"
      );
      const hasDifferentCompany = otherPattern.test(t);

      // If a different company's grade appears and our exact match doesn't, reject
      if (hasDifferentCompany && !hasExactMatch) return false;

      // Also reject if any mentioned grade (from any company) is lower than target
      const gradePattern = /\b(?:psa|bgs|cgc|sgc)\s*(\d+(?:\.\d+)?)\b/gi;
      let match;
      while ((match = gradePattern.exec(t)) !== null) {
        const mentionedGrade = parseFloat(match[1]);
        if (!isNaN(mentionedGrade) && mentionedGrade < targetGrade) {
          return false;
        }
      }
    }
  }

  return true;
}

function filterAndSortListings(rawListings: EbayListing[], ctx?: FilterContext) {
  return rawListings
    .filter((item) => isListingValid(item, ctx))
    .map((item) => ({
      price: item.price?.value ? parseFloat(item.price.value) : null,
      url: item.itemWebUrl || null,
    }))
    .filter((p): p is { price: number; url: string | null } => p.price !== null && p.price > 0)
    .sort((a, b) => a.price - b.price);
}

function buildEbayPrices(
  cardId: string,
  floorListings: EbayListing[],
  rangeListings: EbayListing[],
  ctx?: FilterContext
): Omit<PriceCache, "id" | "fetched_at">[] {
  // Floor query (sort=price) gives us the true cheapest listing
  const floor = filterAndSortListings(floorListings, ctx);
  // Range query (best match) gives us relevant median/high
  const range = filterAndSortListings(rangeListings, ctx);

  // Use whichever set has data; prefer floor for market, range for mid/high
  const all = floor.length > 0 ? floor : range;
  if (all.length === 0) return [];

  const lowest = floor.length > 0 ? floor[0] : range[0];
  const rangeForMedian = range.length > 0 ? range : floor;
  const medianItem = rangeForMedian[Math.floor(rangeForMedian.length / 2)];
  const highest = rangeForMedian[rangeForMedian.length - 1];

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
  card: Card,
  context?: RefreshContext
): Promise<Omit<PriceCache, "id" | "fetched_at">[]> {
  try {
    const token = await getEbayToken();
    if (!token) return [];

    const parts: string[] = [];
    if (card.set_name) parts.push(card.set_name);
    parts.push(card.name);
    if (card.card_number) parts.push(`#${card.card_number}`);
    if (context?.gradingCompany) {
      parts.push(String(context.gradingCompany));
      if (context.grade) parts.push(String(context.grade));
    }
    if (!card.set_name) parts.push("pokemon card");
    const query = parts.join(" ") + " -lot -break -box -pack -repack -japanese -JP";
    const baseFilter = "buyingOptions:{FIXED_PRICE},deliveryCountry:US,price:[5..],priceCurrency:USD";
    const headers = { Authorization: `Bearer ${token}` };

    // Two parallel queries: sort=price for true floor, best-match for range
    const [floorRes, rangeRes] = await Promise.all([
      fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=183454&filter=${baseFilter}&sort=price&limit=20`, { headers }),
      fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=183454&filter=${baseFilter}&limit=50`, { headers }),
    ]);

    const floorData = floorRes.ok ? await floorRes.json() : { itemSummaries: [] };
    const rangeData = rangeRes.ok ? await rangeRes.json() : { itemSummaries: [] };

    const filterCtx: FilterContext = {
      gradingCompany: context?.gradingCompany,
      grade: context?.grade,
      // If rarity contains "1st edition", keep 1st ed listings; otherwise filter them out
      edition: card.rarity && /1st\s*edition/i.test(card.rarity) ? "1st edition" : undefined,
      cardName: card.name,
    };
    return buildEbayPrices(card.id, floorData.itemSummaries || [], rangeData.itemSummaries || [], filterCtx);
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

    const query = parts.join(" ") + " -lot -break -box -pack -repack -japanese -JP";
    const baseFilter = "buyingOptions:{FIXED_PRICE},deliveryCountry:US,price:[5..],priceCurrency:USD";
    const headers = { Authorization: `Bearer ${token}` };

    // Two parallel queries: sort=price for true floor, best-match for range
    const [floorRes, rangeRes] = await Promise.all([
      fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=261328&filter=${baseFilter}&sort=price&limit=20`, { headers }),
      fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=261328&filter=${baseFilter}&limit=50`, { headers }),
    ]);

    const floorData = floorRes.ok ? await floorRes.json() : { itemSummaries: [] };
    const rangeData = rangeRes.ok ? await rangeRes.json() : { itemSummaries: [] };

    const filterCtx: FilterContext = {
      gradingCompany: context?.gradingCompany,
      grade: context?.grade,
      cardName: card.name,
    };
    return buildEbayPrices(card.id, floorData.itemSummaries || [], rangeData.itemSummaries || [], filterCtx);
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
  const market = getAveragePrice(prices); // lowest BIN × 0.85
  const high = prices.find((p) => p.condition_key === "high")?.price_usd ?? null;
  return { low: market, market, high };
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
