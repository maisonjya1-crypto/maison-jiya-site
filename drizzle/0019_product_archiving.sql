ALTER TABLE `products` ADD `archived_at` text;
--> statement-breakpoint
ALTER TABLE `products` ADD `archived_by_user_id` integer;
--> statement-breakpoint
CREATE INDEX `products_archived_at_idx` ON `products` (`archived_at`);
