CREATE TABLE `credit_card_invoice_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payment_method_id` text NOT NULL,
	`reference_month` text NOT NULL,
	`cycle_closing_date` text NOT NULL,
	`cycle_due_date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`payment_method_id`,`user_id`) REFERENCES `payment_methods`(`id`,`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "credit_card_invoice_cycles_reference_month_check" CHECK("credit_card_invoice_cycles"."reference_month" glob '????-??' and substr("credit_card_invoice_cycles"."reference_month", 6, 2) between '01' and '12'),
	CONSTRAINT "credit_card_invoice_cycles_dates_check" CHECK("credit_card_invoice_cycles"."cycle_closing_date" glob '????-??-??' and "credit_card_invoice_cycles"."cycle_due_date" glob '????-??-??')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_card_invoice_cycles_invoice_unique` ON `credit_card_invoice_cycles` (`user_id`,`payment_method_id`,`reference_month`);--> statement-breakpoint
INSERT INTO `credit_card_invoice_cycles` (`id`,`user_id`,`payment_method_id`,`reference_month`,`cycle_closing_date`,`cycle_due_date`,`created_at`,`updated_at`)
SELECT
	`id` || ':cycle',
	`user_id`,
	`payment_method_id`,
	`reference_month`,
	`cycle_closing_date`,
	`cycle_due_date`,
	`created_at`,
	`updated_at`
FROM `credit_card_invoice_payments`;--> statement-breakpoint
INSERT INTO `credit_card_invoice_cycles` (`id`,`user_id`,`payment_method_id`,`reference_month`,`cycle_closing_date`,`cycle_due_date`,`created_at`,`updated_at`)
SELECT
	`transaction_installments`.`payment_method_id` || ':' || `transaction_installments`.`reference_month`,
	`transaction_installments`.`user_id`,
	`transaction_installments`.`payment_method_id`,
	`transaction_installments`.`reference_month`,
	date(
		case when `payment_methods`.`due_day` <= `payment_methods`.`closing_day`
			then date(`transaction_installments`.`reference_month` || '-01', '-1 month')
			else `transaction_installments`.`reference_month` || '-01'
		end,
		'start of month',
		'+' || (
			min(
				`payment_methods`.`closing_day`,
				cast(strftime('%d', date(
					case when `payment_methods`.`due_day` <= `payment_methods`.`closing_day`
						then date(`transaction_installments`.`reference_month` || '-01', '-1 month')
						else `transaction_installments`.`reference_month` || '-01'
					end,
					'start of month', '+1 month', '-1 day'
				)) as integer)
			) - 1
		) || ' days'
	),
	date(
		`transaction_installments`.`reference_month` || '-01',
		'start of month',
		'+' || (
			min(
				`payment_methods`.`due_day`,
				cast(strftime('%d', date(
					`transaction_installments`.`reference_month` || '-01',
					'start of month', '+1 month', '-1 day'
				)) as integer)
			) - 1
		) || ' days'
	),
	`transaction_installments`.`created_at`,
	`transaction_installments`.`updated_at`
FROM `transaction_installments`
INNER JOIN `payment_methods`
	ON `payment_methods`.`id` = `transaction_installments`.`payment_method_id`
	AND `payment_methods`.`user_id` = `transaction_installments`.`user_id`
WHERE `payment_methods`.`closing_day` IS NOT NULL
	AND `payment_methods`.`due_day` IS NOT NULL
ON CONFLICT(`user_id`,`payment_method_id`,`reference_month`) DO NOTHING;
