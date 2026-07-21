PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
BEGIN TRANSACTION;
--> statement-breakpoint
CREATE TABLE `payment_methods__next` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`color_key` text DEFAULT 'indigo' NOT NULL,
	`icon_key` text DEFAULT 'CreditCard' NOT NULL,
	`invoice_control` integer DEFAULT false NOT NULL,
	`closing_day` integer,
	`due_day` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade,
	UNIQUE (`id`, `user_id`),
	CONSTRAINT `payment_methods_kind_check` CHECK(`kind` in ('credit_card', 'debit_card', 'pix', 'cash', 'bank_transfer', 'boleto', 'other')),
	CONSTRAINT `payment_methods_name_length_check` CHECK(length(`name`) between 1 and 80),
	CONSTRAINT `payment_methods_color_key_check` CHECK(`color_key` in ('emerald', 'cyan', 'violet', 'blue', 'orange', 'amber', 'rose', 'teal', 'indigo', 'pink', 'lime', 'red', 'sky', 'fuchsia', 'slate')),
	CONSTRAINT `payment_methods_icon_key_check` CHECK(`icon_key` in ('BriefcaseBusiness', 'CircleDollarSign', 'Gift', 'House', 'Utensils', 'Car', 'HeartPulse', 'Gamepad2', 'Tags', 'WalletCards', 'GraduationCap', 'ShoppingBag', 'Banknote', 'Dumbbell', 'PiggyBank', 'Plane', 'ReceiptText', 'Smartphone', 'TrendingUp', 'Coffee', 'Shirt', 'BookOpen', 'Dog', 'Bus', 'Music', 'CreditCard', 'Landmark', 'QrCode', 'Building2', 'BadgeDollarSign', 'Bitcoin', 'CircleEllipsis')),
	CONSTRAINT `payment_methods_invoice_configuration_check` CHECK((`kind` = 'credit_card' and `invoice_control` = 1 and `closing_day` between 1 and 31 and `due_day` between 1 and 31) or (`invoice_control` = 0 and `closing_day` is null and `due_day` is null))
);
--> statement-breakpoint
CREATE TABLE `categories__next` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`color_key` text NOT NULL,
	`icon_key` text NOT NULL,
	`parent_category_id` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade,
	CONSTRAINT `categories_parent_owner_type_fk` FOREIGN KEY (`parent_category_id`,`user_id`,`type`) REFERENCES `categories__next`(`id`,`user_id`,`type`),
	CONSTRAINT `categories_type_check` CHECK(`type` in ('income', 'expense')),
	CONSTRAINT `categories_name_length_check` CHECK(length(`name`) between 1 and 40),
	CONSTRAINT `categories_color_key_check` CHECK(`color_key` in ('emerald', 'cyan', 'violet', 'blue', 'orange', 'amber', 'rose', 'teal', 'indigo', 'pink', 'lime', 'red', 'sky', 'fuchsia', 'slate')),
	CONSTRAINT `categories_icon_key_check` CHECK(`icon_key` in ('BriefcaseBusiness', 'CircleDollarSign', 'Gift', 'House', 'Utensils', 'Car', 'HeartPulse', 'Gamepad2', 'Tags', 'WalletCards', 'GraduationCap', 'ShoppingBag', 'Banknote', 'Dumbbell', 'PiggyBank', 'Plane', 'ReceiptText', 'Smartphone', 'TrendingUp', 'Coffee', 'Shirt', 'BookOpen', 'Dog', 'Bus', 'Music', 'CreditCard', 'Landmark', 'QrCode', 'Building2', 'BadgeDollarSign', 'Bitcoin', 'CircleEllipsis')),
	UNIQUE (`id`, `user_id`, `type`)
);
--> statement-breakpoint
CREATE TABLE `transactions__next` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`payment_method_id` text,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`occurred_at` text NOT NULL,
	`description` text,
	`invoice_cycle_closing_date` text,
	`invoice_cycle_due_date` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade,
	CONSTRAINT `transactions_category_owner_type_fk` FOREIGN KEY (`category_id`,`user_id`,`type`) REFERENCES `categories__next`(`id`,`user_id`,`type`),
	CONSTRAINT `transactions_payment_method_owner_fk` FOREIGN KEY (`payment_method_id`,`user_id`) REFERENCES `payment_methods__next`(`id`,`user_id`),
	CONSTRAINT `transactions_type_check` CHECK(`type` in ('income', 'expense')),
	CONSTRAINT `transactions_amount_check` CHECK(`amount_cents` > 0 and `amount_cents` <= 9007199254740991),
	CONSTRAINT `transactions_currency_check` CHECK(`currency` = 'BRL'),
	CONSTRAINT `transactions_description_check` CHECK(`description` is null or length(`description`) <= 280),
	CONSTRAINT `transactions_date_check` CHECK(`occurred_at` glob '????-??-??')
);
--> statement-breakpoint
INSERT INTO `payment_methods__next` (`id`,`user_id`,`name`,`kind`,`color_key`,`icon_key`,`invoice_control`,`closing_day`,`due_day`,`archived_at`,`created_at`,`updated_at`)
SELECT `id`,`user_id`,`name`,`kind`,
	CASE `kind` WHEN 'cash' THEN 'emerald' WHEN 'pix' THEN 'teal' WHEN 'debit_card' THEN 'blue' ELSE 'indigo' END,
	CASE `kind` WHEN 'cash' THEN 'Banknote' WHEN 'pix' THEN 'QrCode' WHEN 'debit_card' THEN 'WalletCards' ELSE 'CreditCard' END,
	`invoice_control`,`closing_day`,`due_day`,`archived_at`,`created_at`,`updated_at`
FROM `payment_methods`;
--> statement-breakpoint
INSERT INTO `categories__next` (`id`,`user_id`,`type`,`name`,`normalized_name`,`color_key`,`icon_key`,`parent_category_id`,`archived_at`,`created_at`,`updated_at`)
SELECT `id`,`user_id`,`type`,`name`,`normalized_name`,`color_key`,`icon_key`,`parent_category_id`,`archived_at`,`created_at`,`updated_at` FROM `categories`;
--> statement-breakpoint
INSERT INTO `transactions__next` (`id`,`user_id`,`category_id`,`payment_method_id`,`type`,`amount_cents`,`currency`,`occurred_at`,`description`,`invoice_cycle_closing_date`,`invoice_cycle_due_date`,`archived_at`,`created_at`,`updated_at`)
SELECT `id`,`user_id`,`category_id`,`payment_method_id`,`type`,`amount_cents`,`currency`,`occurred_at`,`description`,`invoice_cycle_closing_date`,`invoice_cycle_due_date`,`archived_at`,`created_at`,`updated_at` FROM `transactions`;
--> statement-breakpoint
DROP TABLE `transactions`;
--> statement-breakpoint
DROP TABLE `categories`;
--> statement-breakpoint
DROP TABLE `payment_methods`;
--> statement-breakpoint
ALTER TABLE `payment_methods__next` RENAME TO `payment_methods`;
--> statement-breakpoint
ALTER TABLE `categories__next` RENAME TO `categories`;
--> statement-breakpoint
ALTER TABLE `transactions__next` RENAME TO `transactions`;
--> statement-breakpoint
CREATE INDEX `payment_methods_owner_archive_index` ON `payment_methods` (`user_id`,`archived_at`,`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_type_parent_name_unique` ON `categories` (`user_id`,`type`,coalesce(`parent_category_id`, '__root__'),`normalized_name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_id_user_type_unique` ON `categories` (`id`,`user_id`,`type`);
--> statement-breakpoint
CREATE INDEX `transactions_history_index` ON `transactions` (`user_id`,`occurred_at`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `transactions_archive_index` ON `transactions` (`user_id`,`archived_at`,`id`);
--> statement-breakpoint
CREATE INDEX `transactions_payment_cycle_index` ON `transactions` (`user_id`,`payment_method_id`,`invoice_cycle_closing_date`,`invoice_cycle_due_date`);
--> statement-breakpoint
PRAGMA foreign_key_check;
--> statement-breakpoint
COMMIT;
--> statement-breakpoint
PRAGMA defer_foreign_keys = OFF;
