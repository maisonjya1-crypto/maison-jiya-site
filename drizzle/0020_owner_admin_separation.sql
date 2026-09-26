ALTER TABLE `users` ADD `is_owner` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `users`
SET `is_owner` = 1, `role` = 'admin'
WHERE `id` = (SELECT `id` FROM `users` ORDER BY `id` ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM `users` WHERE `is_owner` = 1);
--> statement-breakpoint
UPDATE `users` SET `role` = 'admin' WHERE `is_owner` = 1 AND `role` <> 'admin';
--> statement-breakpoint
CREATE UNIQUE INDEX `users_single_owner_unique` ON `users` (`is_owner`) WHERE `is_owner` = 1;
