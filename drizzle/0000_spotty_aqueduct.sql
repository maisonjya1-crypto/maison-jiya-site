CREATE TABLE `ad_performance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text DEFAULT 'Meta Ads' NOT NULL,
	`campaign` text NOT NULL,
	`spend` integer NOT NULL,
	`revenue` integer NOT NULL,
	`order_count` integer NOT NULL,
	`source` text DEFAULT 'Manuel' NOT NULL,
	`performance_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `capital_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`direction` text NOT NULL,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`amount` integer NOT NULL,
	`entry_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`city` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_ref` text NOT NULL,
	`customer_id` integer NOT NULL,
	`city` text NOT NULL,
	`products` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`sale_amount` integer NOT NULL,
	`product_cost` integer DEFAULT 0 NOT NULL,
	`shipping_cost` integer DEFAULT 0 NOT NULL,
	`ad_cost` integer DEFAULT 0 NOT NULL,
	`fees` integer DEFAULT 0 NOT NULL,
	`return_cost` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Nouvelle' NOT NULL,
	`payment_status` text DEFAULT 'À encaisser' NOT NULL,
	`carrier` text DEFAULT 'Non affecté' NOT NULL,
	`tracking_number` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_ref_unique` ON `orders` (`order_ref`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supplier` text NOT NULL,
	`item` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	`total_cost` integer NOT NULL,
	`payment_status` text DEFAULT 'Payé' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
