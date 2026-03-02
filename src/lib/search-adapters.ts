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
      // Sports cards: return empty (manual entry only for now)
      return [];
    default:
      return [];
  }
}
