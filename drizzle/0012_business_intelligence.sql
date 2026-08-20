ALTER TABLE `orders` ADD `campaign` text DEFAULT '' NOT NULL;
ALTER TABLE `capital_ledger` ADD `account` text DEFAULT 'Banque' NOT NULL;
ALTER TABLE `capital_ledger` ADD `order_id` integer;
ALTER TABLE `capital_ledger` ADD `is_automatic` integer DEFAULT false NOT NULL;
ALTER TABLE `capital_ledger` ADD `auto_key` text;
CREATE UNIQUE INDEX `capital_ledger_auto_key_unique` ON `capital_ledger` (`auto_key`);
