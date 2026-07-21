PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_categories` (
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
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_category_id`,`user_id`,`type`) REFERENCES `categories`(`id`,`user_id`,`type`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "categories_type_check" CHECK("__new_categories"."type" in ('income', 'expense')),
	CONSTRAINT "categories_name_length_check" CHECK(length("__new_categories"."name") between 1 and 40),
	CONSTRAINT "categories_color_key_check" CHECK("__new_categories"."color_key" in ('emerald', 'cyan', 'violet', 'blue', 'orange', 'amber', 'rose', 'teal', 'indigo', 'pink', 'lime', 'red', 'sky', 'fuchsia', 'slate')),
	CONSTRAINT "categories_icon_key_check" CHECK("__new_categories"."icon_key" in ('BriefcaseBusiness', 'CircleDollarSign', 'Gift', 'House', 'Utensils', 'Car', 'HeartPulse', 'Gamepad2', 'Tags', 'WalletCards', 'GraduationCap', 'ShoppingBag', 'Banknote', 'Dumbbell', 'PiggyBank', 'Plane', 'ReceiptText', 'Smartphone', 'TrendingUp', 'Coffee', 'Shirt', 'BookOpen', 'Dog', 'Bus', 'Music', 'CreditCard', 'Landmark', 'QrCode', 'Building2', 'BadgeDollarSign', 'Bitcoin', 'CircleEllipsis', 'Baby', 'Bike', 'Calculator', 'Camera', 'Cat', 'CirclePlay', 'ClipboardList', 'Fuel', 'Hotel', 'PawPrint', 'ShoppingCart', 'Stethoscope', 'Ticket', 'Tv', 'Wrench', 'Bird', 'Fish', 'Rabbit', 'Turtle', 'Flower2', 'Trees', 'ChefHat', 'Bath', 'Umbrella', 'BaggageClaim', 'Pill', 'Syringe', 'Laptop', 'Package', 'CatFace', 'CatSitting', 'CatPlay'))
);
--> statement-breakpoint
INSERT INTO `__new_categories`("id", "user_id", "type", "name", "normalized_name", "color_key", "icon_key", "parent_category_id", "archived_at", "created_at", "updated_at") SELECT "id", "user_id", "type", "name", "normalized_name", "color_key", "icon_key", "parent_category_id", "archived_at", "created_at", "updated_at" FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_type_parent_name_unique` ON `categories` (`user_id`,`type`,coalesce(`parent_category_id`, '__root__'),`normalized_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_id_user_type_unique` ON `categories` (`id`,`user_id`,`type`);--> statement-breakpoint
CREATE TABLE `__new_payment_methods` (
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
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "payment_methods_kind_check" CHECK("__new_payment_methods"."kind" in ('credit_card', 'debit_card', 'pix', 'cash', 'bank_transfer', 'boleto', 'other')),
	CONSTRAINT "payment_methods_name_length_check" CHECK(length("__new_payment_methods"."name") between 1 and 80),
	CONSTRAINT "payment_methods_color_key_check" CHECK("__new_payment_methods"."color_key" in ('emerald', 'cyan', 'violet', 'blue', 'orange', 'amber', 'rose', 'teal', 'indigo', 'pink', 'lime', 'red', 'sky', 'fuchsia', 'slate')),
	CONSTRAINT "payment_methods_icon_key_check" CHECK("__new_payment_methods"."icon_key" in ('BriefcaseBusiness', 'CircleDollarSign', 'Gift', 'House', 'Utensils', 'Car', 'HeartPulse', 'Gamepad2', 'Tags', 'WalletCards', 'GraduationCap', 'ShoppingBag', 'Banknote', 'Dumbbell', 'PiggyBank', 'Plane', 'ReceiptText', 'Smartphone', 'TrendingUp', 'Coffee', 'Shirt', 'BookOpen', 'Dog', 'Bus', 'Music', 'CreditCard', 'Landmark', 'QrCode', 'Building2', 'BadgeDollarSign', 'Bitcoin', 'CircleEllipsis', 'Baby', 'Bike', 'Calculator', 'Camera', 'Cat', 'CirclePlay', 'ClipboardList', 'Fuel', 'Hotel', 'PawPrint', 'ShoppingCart', 'Stethoscope', 'Ticket', 'Tv', 'Wrench', 'Bird', 'Fish', 'Rabbit', 'Turtle', 'Flower2', 'Trees', 'ChefHat', 'Bath', 'Umbrella', 'BaggageClaim', 'Pill', 'Syringe', 'Laptop', 'Package', 'CatFace', 'CatSitting', 'CatPlay')),
	CONSTRAINT "payment_methods_invoice_configuration_check" CHECK(("__new_payment_methods"."kind" = 'credit_card' and "__new_payment_methods"."invoice_control" = 1 and "__new_payment_methods"."closing_day" between 1 and 31 and "__new_payment_methods"."due_day" between 1 and 31) or ("__new_payment_methods"."invoice_control" = 0 and "__new_payment_methods"."closing_day" is null and "__new_payment_methods"."due_day" is null))
);
--> statement-breakpoint
INSERT INTO `__new_payment_methods`("id", "user_id", "name", "kind", "color_key", "icon_key", "invoice_control", "closing_day", "due_day", "archived_at", "created_at", "updated_at") SELECT "id", "user_id", "name", "kind", "color_key", "icon_key", "invoice_control", "closing_day", "due_day", "archived_at", "created_at", "updated_at" FROM `payment_methods`;--> statement-breakpoint
DROP TABLE `payment_methods`;--> statement-breakpoint
ALTER TABLE `__new_payment_methods` RENAME TO `payment_methods`;--> statement-breakpoint
CREATE UNIQUE INDEX `payment_methods_id_user_unique` ON `payment_methods` (`id`,`user_id`);--> statement-breakpoint
CREATE INDEX `payment_methods_owner_archive_index` ON `payment_methods` (`user_id`,`archived_at`,`name`);
