ALTER TABLE `orders` ADD `carrier_dispatch_state` text DEFAULT 'À autoriser' NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `carrier_authorized_at` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `carrier_invoice_code` text DEFAULT '' NOT NULL;
