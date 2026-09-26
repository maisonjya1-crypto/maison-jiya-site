CREATE TABLE `mutation_receipts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `request_key` text NOT NULL UNIQUE,
  `user_id` integer NOT NULL,
  `action` text NOT NULL,
  `status` text DEFAULT 'processing' NOT NULL,
  `message` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `completed_at` text
);
--> statement-breakpoint
CREATE INDEX `mutation_receipts_user_id_idx` ON `mutation_receipts` (`user_id`);
--> statement-breakpoint
CREATE INDEX `mutation_receipts_created_at_idx` ON `mutation_receipts` (`created_at`);
