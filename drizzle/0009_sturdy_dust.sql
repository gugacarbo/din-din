CREATE TABLE `credit_card_invoice_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payment_method_id` text NOT NULL,
	`reference_month` text NOT NULL,
	`cycle_closing_date` text NOT NULL,
	`cycle_due_date` text NOT NULL,
	`paid_at` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`payment_method_id`,`user_id`) REFERENCES `payment_methods`(`id`,`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "credit_card_invoice_payments_reference_month_check" CHECK("credit_card_invoice_payments"."reference_month" glob '????-??' and substr("credit_card_invoice_payments"."reference_month", 6, 2) between '01' and '12'),
	CONSTRAINT "credit_card_invoice_payments_dates_check" CHECK("credit_card_invoice_payments"."cycle_closing_date" glob '????-??-??' and "credit_card_invoice_payments"."cycle_due_date" glob '????-??-??' and "credit_card_invoice_payments"."paid_at" glob '????-??-??'),
	CONSTRAINT "credit_card_invoice_payments_amount_check" CHECK("credit_card_invoice_payments"."amount_cents" > 0 and "credit_card_invoice_payments"."amount_cents" <= 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_card_invoice_payments_invoice_unique` ON `credit_card_invoice_payments` (`user_id`,`payment_method_id`,`reference_month`);--> statement-breakpoint
CREATE INDEX `credit_card_invoice_payments_history_index` ON `credit_card_invoice_payments` (`user_id`,`paid_at`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_id_user_unique` ON `transactions` (`id`,`user_id`);--> statement-breakpoint
CREATE TABLE `transaction_installments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`payment_method_id` text NOT NULL,
	`installment_number` integer NOT NULL,
	`installment_count` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`reference_month` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`transaction_id`,`user_id`) REFERENCES `transactions`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payment_method_id`,`user_id`) REFERENCES `payment_methods`(`id`,`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transaction_installments_position_check" CHECK("transaction_installments"."installment_count" between 1 and 36 and "transaction_installments"."installment_number" between 1 and "transaction_installments"."installment_count"),
	CONSTRAINT "transaction_installments_amount_check" CHECK("transaction_installments"."amount_cents" > 0 and "transaction_installments"."amount_cents" <= 9007199254740991),
	CONSTRAINT "transaction_installments_reference_month_check" CHECK("transaction_installments"."reference_month" glob '????-??' and substr("transaction_installments"."reference_month", 6, 2) between '01' and '12')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_installments_transaction_number_unique` ON `transaction_installments` (`transaction_id`,`installment_number`);--> statement-breakpoint
CREATE INDEX `transaction_installments_invoice_index` ON `transaction_installments` (`user_id`,`payment_method_id`,`reference_month`);--> statement-breakpoint
INSERT INTO `transaction_installments` (
	`id`,
	`user_id`,
	`transaction_id`,
	`payment_method_id`,
	`installment_number`,
	`installment_count`,
	`amount_cents`,
	`reference_month`,
	`created_at`,
	`updated_at`
)
SELECT
	`transactions`.`id` || ':1',
	`transactions`.`user_id`,
	`transactions`.`id`,
	`transactions`.`payment_method_id`,
	1,
	1,
	`transactions`.`amount_cents`,
	substr(`transactions`.`invoice_cycle_due_date`, 1, 7),
	`transactions`.`created_at`,
	`transactions`.`updated_at`
FROM `transactions`
WHERE
	`transactions`.`type` = 'expense'
	AND `transactions`.`payment_method_id` IS NOT NULL
	AND `transactions`.`invoice_cycle_due_date` IS NOT NULL;--> statement-breakpoint
DROP INDEX `transactions_payment_cycle_index`;--> statement-breakpoint
ALTER TABLE `transactions` DROP COLUMN `invoice_cycle_closing_date`;--> statement-breakpoint
ALTER TABLE `transactions` DROP COLUMN `invoice_cycle_due_date`;
