CREATE TABLE `expenses` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `category` text NOT NULL,
  `label` text NOT NULL,
  `amount` integer NOT NULL,
  `account` text DEFAULT 'Banque' NOT NULL,
  `payment_status` text DEFAULT 'Payé' NOT NULL,
  `expense_date` text NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expenses_expense_date_idx` ON `expenses` (`expense_date`);
--> statement-breakpoint
CREATE INDEX `expenses_payment_status_idx` ON `expenses` (`payment_status`);
