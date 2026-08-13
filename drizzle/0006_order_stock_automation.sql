ALTER TABLE `orders` ADD `product_id` integer REFERENCES products(id);
--> statement-breakpoint
ALTER TABLE `orders` ADD `stock_deducted` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `order_id` integer REFERENCES orders(id);
--> statement-breakpoint
CREATE INDEX `stock_movements_order_id_idx` ON `stock_movements` (`order_id`);
--> statement-breakpoint
CREATE TRIGGER `prevent_negative_product_stock`
BEFORE UPDATE OF `stock_quantity` ON `products`
WHEN NEW.`stock_quantity` < 0
BEGIN
  SELECT RAISE(ABORT, 'Stock insuffisant');
END;
