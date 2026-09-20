CREATE TABLE IF NOT EXISTS `google_sheets_sync_state` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `current_version` integer DEFAULT 0 NOT NULL,
  `synced_version` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `last_event_at` text,
  `last_attempt_at` text,
  `last_sync_at` text,
  `next_attempt_at` text,
  `last_error` text DEFAULT '' NOT NULL,
  `active_event_id` text DEFAULT '' NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `google_sheets_sync_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `event_id` text NOT NULL UNIQUE,
  `version` integer NOT NULL,
  `status` text NOT NULL,
  `attempt_count` integer DEFAULT 0 NOT NULL,
  `http_status` integer,
  `first_attempt_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `last_attempt_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `synced_at` text,
  `next_attempt_at` text,
  `last_error` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `google_sheets_sync_log_version_idx` ON `google_sheets_sync_log` (`version`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `google_sheets_sync_log_status_idx` ON `google_sheets_sync_log` (`status`, `next_attempt_at`);
--> statement-breakpoint
INSERT INTO `google_sheets_sync_state` (`id`, `current_version`, `synced_version`, `status`, `last_event_at`, `next_attempt_at`)
VALUES (1, 1, 0, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(`id`) DO NOTHING;
