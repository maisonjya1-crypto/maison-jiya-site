-- Public merchandising controls for independent storefront promotions.
-- Display is configured separately from pricing activation.
ALTER TABLE storefront_promotions ADD COLUMN display_enabled INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE storefront_promotions ADD COLUMN badge TEXT DEFAULT 'OFFRE' NOT NULL;
ALTER TABLE storefront_promotions ADD COLUMN cta_label TEXT DEFAULT 'Voir les produits' NOT NULL;
