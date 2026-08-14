ALTER TABLE `orders` ADD `address` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `carrier_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`external_code` text NOT NULL,
	`external_status` text NOT NULL,
	`payload_hash` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`proof_image` text DEFAULT '' NOT NULL,
	`occurred_at` text,
	`order_id` integer,
	`processed` integer DEFAULT false NOT NULL,
	`error_message` text DEFAULT '' NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carrier_events_payload_hash_unique` ON `carrier_events` (`payload_hash`);
--> statement-breakpoint
CREATE INDEX `carrier_events_external_code_idx` ON `carrier_events` (`external_code`);
--> statement-breakpoint
CREATE INDEX `carrier_events_order_id_idx` ON `carrier_events` (`order_id`);
