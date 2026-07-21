CREATE TABLE `support_reports` (
	`report_id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL CHECK(`category` in ('problem','question','suggestion')),
	`status` text NOT NULL DEFAULT 'pending' CHECK(`status` in ('pending','queued','processing','published','manual_review','failed')),
	`attempts` integer NOT NULL DEFAULT 0 CHECK(`attempts` >= 0),
	`issue_number` integer,
	`issue_url` text,
	`safe_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `support_report_payloads` (
	`report_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`message` text NOT NULL CHECK(length(`message`) between 1 and 4000),
	`diagnostics` text NOT NULL CHECK(length(`diagnostics`) <= 65536),
	`metadata` text NOT NULL CHECK(length(`metadata`) <= 4096),
	`screenshot_key` text,
	`received_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `support_reports`(`report_id`) ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade,
	UNIQUE(`user_id`,`client_request_id`)
);
--> statement-breakpoint
CREATE TABLE `support_review_tasks` (
	`event_id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`kind` text NOT NULL CHECK(`kind` in ('manual_review','transient_failure')),
	`reason` text NOT NULL,
	`status` text NOT NULL DEFAULT 'pending' CHECK(`status` in ('pending','sent','observed')),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `support_reports`(`report_id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `support_reports_status_index` ON `support_reports` (`status`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_payload_user_request_unique` ON `support_report_payloads` (`user_id`,`client_request_id`);
--> statement-breakpoint
CREATE INDEX `support_payload_user_received_index` ON `support_report_payloads` (`user_id`,`received_at`);
--> statement-breakpoint
CREATE INDEX `support_payload_expiry_index` ON `support_report_payloads` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `support_review_tasks_status_index` ON `support_review_tasks` (`status`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `support_payload_rate_limit`
BEFORE INSERT ON `support_report_payloads`
WHEN (SELECT count(*) FROM `support_report_payloads` WHERE `user_id` = NEW.`user_id` AND `received_at` > NEW.`received_at` - 900000) >= 5
BEGIN
	SELECT RAISE(ABORT, 'support_rate_limited');
END;
