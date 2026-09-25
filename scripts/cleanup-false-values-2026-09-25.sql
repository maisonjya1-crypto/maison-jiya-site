-- Nettoyage ponctuel des valeurs d'entraînement identifiées dans l'export du 25/09/2026.
-- IMPORTANT : aucune quantité produit et aucune ligne de mouvement de stock n'est supprimée.
-- Les mouvements liés aux fausses commandes sont conservés ; seul leur lien order_id est détaché
-- pour permettre la suppression des commandes sans modifier le stock.

UPDATE stock_movements
SET order_id = NULL
WHERE order_id IN (
  SELECT id FROM orders
  WHERE order_ref IN ('MJ-WAKG4VED', 'MJ-WM8A8503', 'MJ-WPITTI45', 'MJ-W0FQWG4C')
);

DELETE FROM order_status_history
WHERE order_id IN (
  SELECT id FROM orders
  WHERE order_ref IN ('MJ-WAKG4VED', 'MJ-WM8A8503', 'MJ-WPITTI45', 'MJ-W0FQWG4C')
);

DELETE FROM audit_logs
WHERE entity_type = 'Commande'
  AND (
    entity_id IN ('9', '10', '11', '12')
    OR entity_label LIKE 'MJ-WAKG4VED%'
    OR entity_label LIKE 'MJ-WM8A8503%'
    OR entity_label LIKE 'MJ-WPITTI45%'
    OR entity_label LIKE 'MJ-W0FQWG4C%'
  );

DELETE FROM orders
WHERE order_ref IN ('MJ-WAKG4VED', 'MJ-WM8A8503', 'MJ-WPITTI45', 'MJ-W0FQWG4C');

DELETE FROM customers
WHERE id IN (7, 8, 9)
  AND NOT EXISTS (
    SELECT 1 FROM orders WHERE orders.customer_id = customers.id
  );
