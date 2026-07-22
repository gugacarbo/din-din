CREATE TABLE `admin_invite_continuations` (
	`continuation_hmac` text PRIMARY KEY NOT NULL,
	`invite_id` text NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invite_id`) REFERENCES `admin_invites`(`invite_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_continuations_expiry_index` ON `admin_invite_continuations` (`expires_at`);--> statement-breakpoint
CREATE TABLE `admin_invites` (
	`invite_id` text PRIMARY KEY NOT NULL,
	`token_hmac` text NOT NULL,
	`email_normalized` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`consumed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_invites_token_hmac_unique` ON `admin_invites` (`token_hmac`);--> statement-breakpoint
CREATE INDEX `admin_invites_expiry_index` ON `admin_invites` (`expires_at`);--> statement-breakpoint
CREATE INDEX `admin_invites_email_index` ON `admin_invites` (`email_normalized`);--> statement-breakpoint
CREATE TABLE `admin_memberships` (
	`user_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`created_by_invite_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_memberships_created_index` ON `admin_memberships` (`created_at`);--> statement-breakpoint
CREATE TABLE `support_manual_publications` (
	`report_id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`public_issue` text NOT NULL,
	`created_at` integer NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`report_id`) REFERENCES `support_reports`(`report_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `support_manual_publications_actor_index` ON `support_manual_publications` (`actor_user_id`,`created_at`);
