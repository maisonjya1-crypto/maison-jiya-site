-- Avis clients vérifiés, saisis dans le logiciel à partir de vrais retours (WhatsApp, Instagram, appel…).
CREATE TABLE IF NOT EXISTS storefront_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  customer_name TEXT NOT NULL,
  city TEXT DEFAULT '' NOT NULL,
  rating INTEGER DEFAULT 5 NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL,
  product_id INTEGER,
  source TEXT DEFAULT 'WhatsApp' NOT NULL,
  review_date TEXT,
  is_visible INTEGER DEFAULT 1 NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS storefront_reviews_visible_order_idx
ON storefront_reviews (is_visible, sort_order, id);
