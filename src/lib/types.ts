export type CardCategory =
  | "pokemon"
  | "magic"
  | "yugioh"
  | "baseball"
  | "football"
  | "basketball"
  | "hockey";

export type Owner = "remy" | "leo";

export type Condition = "raw" | "graded";

export type GradingCompany = "PSA" | "BGS" | "CGC" | "SGC";

export type PriceSource =
  | "tcgplayer"
  | "cardmarket"
  | "scryfall"
  | "ygoprodeck"
  | "ebay"
  | "manual";

export interface Card {
  id: string;
  category: CardCategory;
  name: string;
  set_name: string | null;
  card_number: string | null;
  year: number | null;
  rarity: string | null;
  image_url: string | null;
  external_id: string | null;
  external_source: string | null;
  created_at: string;
}

export interface CollectionItem {
  id: string;
  card_id: string;
  owner: Owner;
  condition: Condition;
  grading_company: GradingCompany | null;
  grade: number | null;
  quantity: number;
  notes: string | null;
  date_added: string;
  card?: Card;
  prices?: PriceCache[];
}

export interface PriceCache {
  id: string;
  card_id: string;
  source: PriceSource;
  price_usd: number | null;
  condition_key: string | null;
  fetched_at: string;
}

// Search result from external APIs
export interface SearchResult {
  external_id: string;
  external_source: string;
  name: string;
  set_name: string | null;
  card_number: string | null;
  year: number | null;
  rarity: string | null;
  image_url: string | null;
  category: CardCategory;
  prices?: { source: PriceSource; price_usd: number; condition_key: string }[];
}

export interface PriceHistoryEntry {
  id: string;
  card_id: string;
  source: string;
  price_usd: number | null;
  condition_key: string | null;
  recorded_at: string;
}

export interface WishlistItem {
  id: string;
  owner: Owner;
  category: string;
  name: string;
  set_name: string | null;
  card_number: string | null;
  year: number | null;
  notes: string | null;
  target_price: number | null;
  image_url: string | null;
  external_id: string | null;
  external_source: string | null;
  created_at: string;
}

export interface ShareLink {
  id: string;
  share_token: string;
  owner_filter: string | null;
  category_filter: string | null;
  created_at: string;
  expires_at: string | null;
}

// Supabase Database type
export interface Database {
  public: {
    Tables: {
      cards: {
        Row: Card;
        Insert: Omit<Card, "id" | "created_at">;
        Update: Partial<Omit<Card, "id" | "created_at">>;
      };
      collection_items: {
        Row: CollectionItem;
        Insert: Omit<CollectionItem, "id" | "date_added" | "card" | "prices">;
        Update: Partial<
          Omit<CollectionItem, "id" | "date_added" | "card" | "prices">
        >;
      };
      price_cache: {
        Row: PriceCache;
        Insert: Omit<PriceCache, "id" | "fetched_at">;
        Update: Partial<Omit<PriceCache, "id" | "fetched_at">>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
