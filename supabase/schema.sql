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

-- Price history: archived prices for trend tracking
CREATE TABLE IF NOT EXISTS price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  source text NOT NULL,
  price_usd numeric,
  condition_key text,
  recorded_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_history_card_id ON price_history(card_id);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at);
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on price_history" ON price_history FOR ALL USING (true) WITH CHECK (true);

-- Wishlist items
CREATE TABLE IF NOT EXISTS wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner text NOT NULL CHECK (owner IN ('remy', 'leo')),
  category text NOT NULL,
  name text NOT NULL,
  set_name text,
  card_number text,
  year int,
  notes text,
  target_price numeric,
  image_url text,
  external_id text,
  external_source text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_owner ON wishlist_items(owner);
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on wishlist_items" ON wishlist_items FOR ALL USING (true) WITH CHECK (true);

-- Share links for public collection viewing
CREATE TABLE IF NOT EXISTS share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  owner_filter text,
  category_filter text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(share_token);
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on share_links" ON share_links FOR ALL USING (true) WITH CHECK (true);
