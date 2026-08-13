ALTER TABLE `orders` ADD `source` text DEFAULT 'Non renseignée' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `paid_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `updated_at` text;--> statement-breakpoint
UPDATE `orders` SET `updated_at` = `created_at` WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `orders` SET `paid_at` = `created_at` WHERE `payment_status` = 'Encaissé' AND `paid_at` IS NULL;
