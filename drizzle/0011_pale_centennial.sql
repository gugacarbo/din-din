DROP TABLE `admin_invite_continuations`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_admin_invites` (
	`invite_id` text PRIMARY KEY NOT NULL,
	`token_hmac` text,
	`token_digest` text,
	`email_normalized` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`consumed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_admin_invites`("invite_id", "token_hmac", "token_digest", "email_normalized", "expires_at", "consumed_at", "consumed_by_user_id", "created_at") SELECT "invite_id", "token_hmac", NULL, "email_normalized", "expires_at", "consumed_at", "consumed_by_user_id", "created_at" FROM `admin_invites`;--> statement-breakpoint
DROP TABLE `admin_invites`;--> statement-breakpoint
ALTER TABLE `__new_admin_invites` RENAME TO `admin_invites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `admin_invites_token_hmac_unique` ON `admin_invites` (`token_hmac`);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_invites_token_digest_unique` ON `admin_invites` (`token_digest`);--> statement-breakpoint
CREATE INDEX `admin_invites_expiry_index` ON `admin_invites` (`expires_at`);--> statement-breakpoint
CREATE INDEX `admin_invites_email_index` ON `admin_invites` (`email_normalized`);
