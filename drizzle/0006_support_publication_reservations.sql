ALTER TABLE `support_reports` ADD `publication_token` text;
--> statement-breakpoint
ALTER TABLE `support_reports` ADD `publication_reserved_at` integer;
--> statement-breakpoint
CREATE INDEX `support_reports_publication_index` ON `support_reports` (`publication_token`,`publication_reserved_at`);
