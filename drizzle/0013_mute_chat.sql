ALTER TABLE `ad_performance` ADD `external_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ad_performance` ADD `native_spend_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `ad_performance` ADD `native_revenue_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `ad_performance` ADD `native_currency` text DEFAULT 'MAD' NOT NULL;
