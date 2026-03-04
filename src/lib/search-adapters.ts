import type { SearchResult, CardCategory } from "./types";

// Pokemon TCG adapter (pokemontcg.io)
async function searchPokemon(query: string): Promise<SearchResult[]> {
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(query)}*"&pageSize=20&orderBy=-set.releaseDate`,
    { headers: { "X-Api-Key": process.env.POKEMON_TCG_API_KEY || "" } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map(
    (card: {
      id: string;
      name: string;
      set?: { name: string };
      number?: string;
      rarity?: string;
      images?: { small: string };
      tcgplayer?: {
        prices?: Record<
          string,
          { market?: number; mid?: number; low?: number }
        >;
      };
    }) => {
      const prices: SearchResult["prices"] = [];
      if (card.tcgplayer?.prices) {
        for (const [key, val] of Object.entries(card.tcgplayer.prices)) {
          if (val.market)
            prices.push({
              source: "tcgplayer",
              price_usd: val.market,
              condition_key: `${key}_market`,
            });
          if (val.mid)
            prices.push({
              source: "tcgplayer",
              price_usd: val.mid,
              condition_key: `${key}_mid`,
            });
          if (val.low)
            prices.push({
              source: "tcgplayer",
              price_usd: val.low,
              condition_key: `${key}_low`,
            });
        }
      }
      return {
        external_id: card.id,
        external_source: "pokemontcg",
        name: card.name,
        set_name: card.set?.name || null,
        card_number: card.number || null,
        year: null,
        rarity: card.rarity || null,
        image_url: card.images?.small || null,
        category: "pokemon" as CardCategory,
        prices,
      };
    }
  );
}

// Magic: The Gathering adapter (Scryfall)
async function searchMagic(query: string): Promise<SearchResult[]> {
  const res = await fetch(
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=released&dir=desc`,
    { headers: { "User-Agent": "CardVault/1.0" } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).slice(0, 20).map(
    (card: {
      id: string;
      name: string;
      set_name?: string;
      collector_number?: string;
      released_at?: string;
      rarity?: string;
      image_uris?: { normal: string; small: string };
      card_faces?: { image_uris?: { normal: string; small: string } }[];
      prices?: Record<string, string | null>;
    }) => {
      const prices: SearchResult["prices"] = [];
      if (card.prices) {
        if (card.prices.usd)
          prices.push({
            source: "scryfall",
            price_usd: parseFloat(card.prices.usd),
            condition_key: "market",
          });
        if (card.prices.usd_foil)
          prices.push({
            source: "scryfall",
            price_usd: parseFloat(card.prices.usd_foil),
            condition_key: "foil",
          });
      }
      const imageUrl =
        card.image_uris?.normal ||
        card.card_faces?.[0]?.image_uris?.normal ||
        null;
      return {
        external_id: card.id,
        external_source: "scryfall",
        name: card.name,
        set_name: card.set_name || null,
        card_number: card.collector_number || null,
        year: card.released_at
          ? parseInt(card.released_at.substring(0, 4))
          : null,
        rarity: card.rarity || null,
        image_url: imageUrl,
        category: "magic" as CardCategory,
        prices,
      };
    }
  );
}

// Yu-Gi-Oh adapter (YGOPRODeck)
async function searchYugioh(query: string): Promise<SearchResult[]> {
  const res = await fetch(
    `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}&num=20&offset=0`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map(
    (card: {
      id: number;
      name: string;
      card_sets?: { set_name: string; set_code: string }[];
      card_images?: { image_url: string; image_url_small: string }[];
      card_prices?: {
        tcgplayer_price?: string;
        cardmarket_price?: string;
        ebay_price?: string;
        amazon_price?: string;
      }[];
    }) => {
      const prices: SearchResult["prices"] = [];
      if (card.card_prices?.[0]) {
        const p = card.card_prices[0];
        if (p.tcgplayer_price && parseFloat(p.tcgplayer_price) > 0)
          prices.push({
            source: "tcgplayer",
            price_usd: parseFloat(p.tcgplayer_price),
            condition_key: "market",
          });
        if (p.cardmarket_price && parseFloat(p.cardmarket_price) > 0)
          prices.push({
            source: "cardmarket",
            price_usd: parseFloat(p.cardmarket_price),
            condition_key: "market",
          });
        if (p.ebay_price && parseFloat(p.ebay_price) > 0)
          prices.push({
            source: "ebay",
            price_usd: parseFloat(p.ebay_price),
            condition_key: "market",
          });
      }
      return {
        external_id: String(card.id),
        external_source: "ygoprodeck",
        name: card.name,
        set_name: card.card_sets?.[0]?.set_name || null,
        card_number: card.card_sets?.[0]?.set_code || null,
        year: null,
        rarity: null,
        image_url: card.card_images?.[0]?.image_url_small || null,
        category: "yugioh" as CardCategory,
        prices,
      };
    }
  );
}

// Map our categories to TheSportsDB sport names
const SPORT_MAP: Record<string, string> = {
  baseball: "Baseball",
  football: "American Football",
  basketball: "Basketball",
  hockey: "Ice Hockey",
};

// Sports card adapter (TheSportsDB for player data + eBay Browse for pricing)
async function searchSportsPlayer(
  query: string,
  category: CardCategory
): Promise<SearchResult[]> {
  // Search TheSportsDB for player info
  const playerQuery = query.replace(/\s+/g, "_");
  const res = await fetch(
    `https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=${encodeURIComponent(playerQuery)}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.player) return [];

  const targetSport = SPORT_MAP[category];

  // Filter to matching sport and deduplicate by player name
  const seen = new Set<string>();
  const players = (
    data.player as {
      idPlayer: string;
      strPlayer: string;
      strTeam: string;
      strSport: string;
      strThumb: string | null;
      strCutout: string | null;
      strPosition: string | null;
      dateBorn: string | null;
      strNationality: string | null;
    }[]
  )
    .filter((p) => {
      if (targetSport && p.strSport !== targetSport) return false;
      if (seen.has(p.strPlayer)) return false;
      seen.add(p.strPlayer);
      return true;
    })
    .slice(0, 10);

  // Return players without prices — prices fetched later with full card details
  return players.map((player) => ({
    external_id: `sportsdb_${player.idPlayer}`,
    external_source: "thesportsdb",
    name: player.strPlayer,
    set_name: player.strTeam,
    card_number: null,
    year: null,
    rarity: player.strPosition,
    image_url: player.strCutout || player.strThumb || null,
    category,
    prices: [],
  }));
}

// eBay Browse API for sports card pricing estimates
// Uses OAuth client credentials flow — needs EBAY_CLIENT_ID and EBAY_CLIENT_SECRET env vars
async function fetchEbayEstimate(
  playerName: string,
  category: CardCategory
): Promise<SearchResult["prices"]> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  try {
    // Get OAuth token
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
    const accessToken = tokenData.access_token;

    // Search for active Buy It Now listings
    const sportKeyword =
      category === "football"
        ? "football"
        : category === "basketball"
          ? "basketball"
          : category === "hockey"
            ? "hockey"
            : "baseball";
    const searchQuery = `${playerName} ${sportKeyword} card`;
    const browseRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchQuery)}&category_ids=261328&filter=buyingOptions:{FIXED_PRICE},deliveryCountry:US&sort=price&limit=10`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!browseRes.ok) return [];
    const browseData = await browseRes.json();

    const listings = browseData.itemSummaries || [];
    if (listings.length === 0) return [];

    // Floor-price model: take lowest 5 BIN listings, median them,
    // then discount 15% to approximate actual sold value
    const DISCOUNT = 0.85; // 15% below asking ≈ sold price
    const FLOOR_COUNT = 5;

    const listingPrices: number[] = listings
      .map(
        (item: { price?: { value?: string } }) =>
          item.price?.value ? parseFloat(item.price.value) : null
      )
      .filter((p: number | null): p is number => p !== null && p > 0)
      .sort((a: number, b: number) => a - b);

    if (listingPrices.length === 0) return [];

    // Use the lowest N listings for the floor estimate
    const floor = listingPrices.slice(0, FLOOR_COUNT);
    const floorMedian = floor[Math.floor(floor.length / 2)];
    const estimated = Math.round(floorMedian * DISCOUNT * 100) / 100;
    const low = Math.round(listingPrices[0] * DISCOUNT * 100) / 100;
    const high = listingPrices[listingPrices.length - 1];

    return [
      { source: "ebay", price_usd: estimated, condition_key: "market" },
      { source: "ebay", price_usd: low, condition_key: "low" },
      { source: "ebay", price_usd: high, condition_key: "high" },
    ];
  } catch {
    return [];
  }
}

export async function searchCards(
  category: CardCategory,
  query: string
): Promise<SearchResult[]> {
  switch (category) {
    case "pokemon":
      return searchPokemon(query);
    case "magic":
      return searchMagic(query);
    case "yugioh":
      return searchYugioh(query);
    case "baseball":
    case "football":
    case "basketball":
    case "hockey":
      return searchSportsPlayer(query, category);
    default:
      return [];
  }
}
