CREATE TABLE `inventory_counts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`count_ref` text NOT NULL,
	`product_id` integer NOT NULL,
	`system_quantity` integer NOT NULL,
	`physical_quantity` integer NOT NULL,
	`difference` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`counted_by_user_id` integer,
	`counted_by_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_counts_count_ref_unique` ON `inventory_counts` (`count_ref`);--> statement-breakpoint
CREATE INDEX `inventory_counts_product_id_idx` ON `inventory_counts` (`product_id`);
