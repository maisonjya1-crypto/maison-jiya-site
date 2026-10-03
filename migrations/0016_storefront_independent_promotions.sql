-- Independent automatic promotions for the public storefront.
-- Each rule owns its own calculator; automatic promotions are non-cumulative by default.
CREATE TABLE IF NOT EXISTS storefront_promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '' NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('second_item_percent', 'percent_items', 'buy_x_get_y_free')),
  percent_value REAL DEFAULT 0 NOT NULL,
  minimum_quantity INTEGER DEFAULT 1 NOT NULL,
  buy_quantity INTEGER DEFAULT 0 NOT NULL,
  free_quantity INTEGER DEFAULT 0 NOT NULL,
  eligible_categories TEXT DEFAULT '[]' NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  priority INTEGER DEFAULT 100 NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS storefront_promotions_active_priority_idx
ON storefront_promotions (is_active, priority, id);

-- Migrate the current hard-coded Maison Jiya offer into the promotion manager.
INSERT INTO storefront_promotions (
  name, code, description, rule_type, percent_value, minimum_quantity,
  buy_quantity, free_quantity, eligible_categories, is_active, priority, created_at
)
SELECT
  '2e article -50 %',
  'PROMO:2E50',
  'Réduction de 50 % sur l''article éligible le moins cher lorsque le panier contient au moins 2 articles éligibles.',
  'second_item_percent',
  50,
  2,
  0,
  0,
  '["Montres","Bijoux","Portefeuilles"]',
  1,
  10,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM storefront_promotions WHERE code = 'PROMO:2E50'
);
