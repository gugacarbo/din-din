CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`color_key` text NOT NULL,
	`icon_key` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "categories_type_check" CHECK("categories"."type" in ('income', 'expense')),
	CONSTRAINT "categories_name_length_check" CHECK(length("categories"."name") between 1 and 40),
	CONSTRAINT "categories_color_key_check" CHECK("categories"."color_key" in ('emerald', 'cyan', 'violet', 'blue', 'orange', 'amber', 'rose', 'teal')),
	CONSTRAINT "categories_icon_key_check" CHECK("categories"."icon_key" in ('BriefcaseBusiness', 'CircleDollarSign', 'Gift', 'House', 'Utensils', 'Car', 'HeartPulse', 'Gamepad2', 'Tags', 'WalletCards', 'GraduationCap', 'ShoppingBag'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_type_name_unique` ON `categories` (`user_id`,`type`,`normalized_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_id_user_type_unique` ON `categories` (`id`,`user_id`,`type`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`occurred_at` text NOT NULL,
	`description` text,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`,`user_id`,`type`) REFERENCES `categories`(`id`,`user_id`,`type`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_type_check" CHECK("transactions"."type" in ('income', 'expense')),
	CONSTRAINT "transactions_amount_check" CHECK("transactions"."amount_cents" > 0 and "transactions"."amount_cents" <= 9007199254740991),
	CONSTRAINT "transactions_currency_check" CHECK("transactions"."currency" = 'BRL'),
	CONSTRAINT "transactions_description_check" CHECK("transactions"."description" is null or length("transactions"."description") <= 280),
	CONSTRAINT "transactions_date_check" CHECK("transactions"."occurred_at" glob '????-??-??')
);
--> statement-breakpoint
CREATE INDEX `transactions_history_index` ON `transactions` (`user_id`,`occurred_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_archive_index` ON `transactions` (`user_id`,`archived_at`,`id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_bootstrap` (
	`user_id` text PRIMARY KEY NOT NULL,
	`seeded_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
