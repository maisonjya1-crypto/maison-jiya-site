CREATE TABLE IF NOT EXISTS storefront_marketing_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  eyebrow TEXT DEFAULT '' NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '' NOT NULL,
  badge TEXT DEFAULT '' NOT NULL,
  cta_label TEXT DEFAULT 'Voir' NOT NULL,
  target TEXT DEFAULT 'offers' NOT NULL,
  placement TEXT DEFAULT 'after_categories' NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS storefront_marketing_sections_active_order_idx
ON storefront_marketing_sections (is_active, placement, sort_order, id);
