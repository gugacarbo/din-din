CREATE TABLE `ai_invocations` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`agent_key` text NOT NULL,
	`user_id` text,
	`report_id` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`ttft_ms` integer,
	`duration_ms` integer NOT NULL,
	`success` integer NOT NULL,
	`error_message` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`report_id`) REFERENCES `support_reports`(`report_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_invocations_model_created_index` ON `ai_invocations` (`model`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ai_invocations_report_index` ON `ai_invocations` (`report_id`);
--> statement-breakpoint
CREATE INDEX `ai_invocations_agent_user_index` ON `ai_invocations` (`agent_key`,`user_id`);