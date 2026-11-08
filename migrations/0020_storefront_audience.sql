-- Gamme publique d'un produit : Homme, Femme ou Unisexe (vide = non classé).
ALTER TABLE storefront_product_settings ADD COLUMN audience TEXT DEFAULT '' NOT NULL;
