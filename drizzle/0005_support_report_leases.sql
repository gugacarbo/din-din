ALTER TABLE `support_reports` ADD `lease_token` text;
--> statement-breakpoint
ALTER TABLE `support_reports` ADD `lease_expires_at` integer;
--> statement-breakpoint
CREATE INDEX `support_reports_lease_index` ON `support_reports` (`status`,`lease_expires_at`);
