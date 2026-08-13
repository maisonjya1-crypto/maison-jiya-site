ALTER TABLE `orders` ADD `deleted_at` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `deleted_by_user_id` integer;
--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`changed_by_user_id` integer,
	`changed_by_name` text NOT NULL,
	`changed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_status_history_order_id_idx` ON `order_status_history` (`order_id`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`entity_label` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);
--> statement-breakpoint
CREATE TABLE `daily_backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`backup_date` text NOT NULL,
	`reason` text DEFAULT 'Automatique' NOT NULL,
	`snapshot_json` text NOT NULL,
	`record_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_backups_backup_date_unique` ON `daily_backups` (`backup_date`);
