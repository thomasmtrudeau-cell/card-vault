-- Card Vault Database Schema

-- Cards table: core card identity, deduplicated across collections
CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('pokemon', 'magic', 'yugioh', 'baseball', 'football', 'basketball', 'hockey')),
  name text NOT NULL,
  set_name text,
  card_number text,
  year int,
  rarity text,
  image_url text,
  external_id text,
  external_source text,
  created_at timestamptz DEFAULT now()
);

-- Collection items: each physical card in the collection
CREATE TABLE IF NOT EXISTS collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  owner text NOT NULL CHECK (owner IN ('remy', 'leo')),
  condition text NOT NULL CHECK (condition IN ('raw', 'graded')),
  grading_company text CHECK (grading_company IN ('PSA', 'BGS', 'CGC', 'SGC')),
  grade numeric CHECK (grade >= 1 AND grade <= 10),
  quantity int DEFAULT 1,
  notes text,
  date_added timestamptz DEFAULT now()
);

-- Price cache: cached prices from external sources
CREATE TABLE IF NOT EXISTS price_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('tcgplayer', 'cardmarket', 'scryfall', 'ygoprodeck', 'ebay', 'manual')),
  price_usd numeric,
  condition_key text,
  fetched_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_collection_items_card_id ON collection_items(card_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_owner ON collection_items(owner);
CREATE INDEX IF NOT EXISTS idx_price_cache_card_id ON price_cache(card_id);
CREATE INDEX IF NOT EXISTS idx_price_cache_fetched_at ON price_cache(fetched_at);
CREATE INDEX IF NOT EXISTS idx_cards_category ON cards(category);
CREATE INDEX IF NOT EXISTS idx_cards_external_id ON cards(external_id);

-- Enable Row Level Security (open for now since this is a personal app)
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon key (personal app, no auth needed)
CREATE POLICY "Allow all on cards" ON cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on collection_items" ON collection_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on price_cache" ON price_cache FOR ALL USING (true) WITH CHECK (true);
