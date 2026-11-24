-- API Conversions Meta : consentement + identifiants navigateur de la commande (si le client a accepté
-- les cookies Meta), et date d'envoi de l'événement Purchase quand la commande est livrée.
ALTER TABLE orders ADD COLUMN marketing_attribution_json TEXT;
ALTER TABLE orders ADD COLUMN capi_purchase_sent_at TEXT;
