import { relations, sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

const authTimestamps = {
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
};

const financeTimestamps = {
	createdAt: integer("created_at", { mode: "number" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
	updatedAt: integer("updated_at", { mode: "number" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
};

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" })
		.notNull()
		.default(false),
	image: text("image"),
	...authTimestamps,
});

export const session = sqliteTable("session", {
	id: text("id").primaryKey(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
	token: text("token").notNull().unique(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	...authTimestamps,
});

export const account = sqliteTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: integer("access_token_expires_at", {
		mode: "timestamp_ms",
	}),
	refreshTokenExpiresAt: integer("refresh_token_expires_at", {
		mode: "timestamp_ms",
	}),
	scope: text("scope"),
	password: text("password"),
	...authTimestamps,
});

export const verification = sqliteTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
	...authTimestamps,
});

export const userBootstrap = sqliteTable("user_bootstrap", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	seededAt: integer("seeded_at", { mode: "number" }).notNull(),
});

/** O pai deliberadamente não guarda identidade nem conteúdo privado. */
export const supportReports = sqliteTable(
	"support_reports",
	{
		reportId: text("report_id").primaryKey(),
		category: text("category", {
			enum: ["problem", "question", "suggestion"],
		}).notNull(),
		status: text("status", {
			enum: [
				"pending",
				"queued",
				"processing",
				"published",
				"manual_review",
				"failed",
			],
		})
			.notNull()
			.default("pending"),
		attempts: integer("attempts").notNull().default(0),
		leaseToken: text("lease_token"),
		leaseExpiresAt: integer("lease_expires_at", { mode: "number" }),
		publicationToken: text("publication_token"),
		publicationReservedAt: integer("publication_reserved_at", {
			mode: "number",
		}),
		issueNumber: integer("issue_number"),
		issueUrl: text("issue_url"),
		safeReason: text("safe_reason"),
		createdAt: integer("created_at", { mode: "number" }).notNull(),
		updatedAt: integer("updated_at", { mode: "number" }).notNull(),
	},
	(table) => [
		index("support_reports_status_index").on(table.status, table.createdAt),
	],
);

/** Esta linha inteira é apagada após a retenção; não se deve nulificar campos. */
export const supportReportPayloads = sqliteTable(
	"support_report_payloads",
	{
		reportId: text("report_id")
			.primaryKey()
			.references(() => supportReports.reportId, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		clientRequestId: text("client_request_id").notNull(),
		fingerprint: text("fingerprint").notNull(),
		message: text("message").notNull(),
		diagnostics: text("diagnostics").notNull(),
		metadata: text("metadata").notNull(),
		screenshotKey: text("screenshot_key"),
		receivedAt: integer("received_at", { mode: "number" }).notNull(),
		expiresAt: integer("expires_at", { mode: "number" }).notNull(),
	},
	(table) => [
		uniqueIndex("support_payload_user_request_unique").on(
			table.userId,
			table.clientRequestId,
		),
		index("support_payload_user_received_index").on(
			table.userId,
			table.receivedAt,
		),
		index("support_payload_expiry_index").on(table.expiresAt),
	],
);

export const supportReviewTasks = sqliteTable(
	"support_review_tasks",
	{
		eventId: text("event_id").primaryKey(),
		reportId: text("report_id")
			.notNull()
			.references(() => supportReports.reportId, { onDelete: "cascade" }),
		kind: text("kind", {
			enum: ["manual_review", "transient_failure"],
		}).notNull(),
		reason: text("reason").notNull(),
		status: text("status", { enum: ["pending", "sent", "observed"] })
			.notNull()
			.default("pending"),
		createdAt: integer("created_at", { mode: "number" }).notNull(),
		updatedAt: integer("updated_at", { mode: "number" }).notNull(),
	},
	(table) => [
		index("support_review_tasks_status_index").on(
			table.status,
			table.createdAt,
		),
	],
);

/** Membership is the only authority for the protected support area. */
export const adminMemberships = sqliteTable(
	"admin_memberships",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "number" }).notNull(),
		createdByInviteId: text("created_by_invite_id"),
	},
	(table) => [index("admin_memberships_created_index").on(table.createdAt)],
);

export const adminInvites = sqliteTable(
	"admin_invites",
	{
		inviteId: text("invite_id").primaryKey(),
		tokenHmac: text("token_hmac").notNull().unique(),
		emailNormalized: text("email_normalized").notNull(),
		expiresAt: integer("expires_at", { mode: "number" }).notNull(),
		consumedAt: integer("consumed_at", { mode: "number" }),
		consumedByUserId: text("consumed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "number" }).notNull(),
	},
	(table) => [
		index("admin_invites_expiry_index").on(table.expiresAt),
		index("admin_invites_email_index").on(table.emailNormalized),
	],
);

export const adminInviteContinuations = sqliteTable(
	"admin_invite_continuations",
	{
		continuationHmac: text("continuation_hmac").primaryKey(),
		inviteId: text("invite_id")
			.notNull()
			.references(() => adminInvites.inviteId, { onDelete: "cascade" }),
		nonce: text("nonce").notNull(),
		expiresAt: integer("expires_at", { mode: "number" }).notNull(),
		createdAt: integer("created_at", { mode: "number" }).notNull(),
	},
	(table) => [index("admin_continuations_expiry_index").on(table.expiresAt)],
);

export const supportManualPublications = sqliteTable(
	"support_manual_publications",
	{
		reportId: text("report_id")
			.primaryKey()
			.references(() => supportReports.reportId, { onDelete: "cascade" }),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		contentHash: text("content_hash").notNull(),
		publicIssue: text("public_issue").notNull(),
		createdAt: integer("created_at", { mode: "number" }).notNull(),
		publishedAt: integer("published_at", { mode: "number" }),
	},
	(table) => [
		index("support_manual_publications_actor_index").on(
			table.actorUserId,
			table.createdAt,
		),
	],
);

/**
 * Registro de uso de LLM/AI — ADR-0011.
 * Armazena somente metadados de invocação; nunca o conteúdo do prompt.
 */
export const aiInvocations = sqliteTable(
	"ai_invocations",
	{
		id: text("id").primaryKey(),
		model: text("model").notNull(),
		/** Identifica qual agente/processo disparou a invocação (ex.: "issue-writer"). */
		agentKey: text("agent_key").notNull(),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		reportId: text("report_id").references(() => supportReports.reportId, {
			onDelete: "set null",
		}),
		inputTokens: integer("input_tokens"),
		outputTokens: integer("output_tokens"),
		totalTokens: integer("total_tokens"),
		ttftMs: integer("ttft_ms"),
		durationMs: integer("duration_ms").notNull(),
		success: integer("success").notNull(),
		errorMessage: text("error_message"),
		/** JSON livre para metadados adicionais do processo. */
		metadata: text("metadata"),
		createdAt: integer("created_at", { mode: "number" }).notNull(),
	},
	(table) => [
		index("ai_invocations_model_created_index").on(
			table.model,
			table.createdAt,
		),
		index("ai_invocations_report_index").on(table.reportId),
		index("ai_invocations_agent_user_index").on(table.agentKey, table.userId),
	],
);

export const categories = sqliteTable(
	"categories",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: text("type", { enum: ["income", "expense"] }).notNull(),
		name: text("name").notNull(),
		normalizedName: text("normalized_name").notNull(),
		colorKey: text("color_key").notNull(),
		iconKey: text("icon_key").notNull(),
		parentCategoryId: text("parent_category_id"),
		archivedAt: integer("archived_at", { mode: "number" }),
		...financeTimestamps,
	},
	(table) => [
		uniqueIndex("categories_user_type_parent_name_unique").on(
			table.userId,
			table.type,
			sql`coalesce(${table.parentCategoryId}, '__root__')`,
			table.normalizedName,
		),
		uniqueIndex("categories_id_user_type_unique").on(
			table.id,
			table.userId,
			table.type,
		),
		check("categories_type_check", sql`${table.type} in ('income', 'expense')`),
		check(
			"categories_name_length_check",
			sql`length(${table.name}) between 1 and 40`,
		),
		foreignKey({
			columns: [table.parentCategoryId, table.userId, table.type],
			foreignColumns: [table.id, table.userId, table.type],
			name: "categories_parent_owner_type_fk",
		}),
		check(
			"categories_color_key_check",
			sql`${table.colorKey} in ('emerald', 'cyan', 'violet', 'blue', 'orange', 'amber', 'rose', 'teal', 'indigo', 'pink', 'lime', 'red', 'sky', 'fuchsia', 'slate')`,
		),
		check(
			"categories_icon_key_check",
			sql`${table.iconKey} in ('BriefcaseBusiness', 'CircleDollarSign', 'Gift', 'House', 'Utensils', 'Car', 'HeartPulse', 'Gamepad2', 'Tags', 'WalletCards', 'GraduationCap', 'ShoppingBag', 'Banknote', 'Dumbbell', 'PiggyBank', 'Plane', 'ReceiptText', 'Smartphone', 'TrendingUp', 'Coffee', 'Shirt', 'BookOpen', 'Dog', 'Bus', 'Music', 'CreditCard', 'Landmark', 'QrCode', 'Building2', 'BadgeDollarSign', 'Bitcoin', 'CircleEllipsis', 'Baby', 'Bike', 'Calculator', 'Camera', 'Cat', 'CirclePlay', 'ClipboardList', 'Fuel', 'Hotel', 'PawPrint', 'ShoppingCart', 'Stethoscope', 'Ticket', 'Tv', 'Wrench', 'Bird', 'Fish', 'Rabbit', 'Turtle', 'Flower2', 'Trees', 'ChefHat', 'Bath', 'Umbrella', 'BaggageClaim', 'Pill', 'Syringe', 'Laptop', 'Package', 'CatFace', 'CatSitting', 'CatPlay')`,
		),
	],
);

export const paymentMethods = sqliteTable(
	"payment_methods",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		kind: text("kind", {
			enum: [
				"credit_card",
				"debit_card",
				"pix",
				"cash",
				"bank_transfer",
				"boleto",
				"other",
			],
		}).notNull(),
		colorKey: text("color_key").notNull().default("indigo"),
		iconKey: text("icon_key").notNull().default("CreditCard"),
		invoiceControl: integer("invoice_control", { mode: "boolean" })
			.notNull()
			.default(false),
		closingDay: integer("closing_day"),
		dueDay: integer("due_day"),
		archivedAt: integer("archived_at", { mode: "number" }),
		...financeTimestamps,
	},
	(table) => [
		uniqueIndex("payment_methods_id_user_unique").on(table.id, table.userId),
		index("payment_methods_owner_archive_index").on(
			table.userId,
			table.archivedAt,
			table.name,
		),
		check(
			"payment_methods_kind_check",
			sql`${table.kind} in ('credit_card', 'debit_card', 'pix', 'cash', 'bank_transfer', 'boleto', 'other')`,
		),
		check(
			"payment_methods_name_length_check",
			sql`length(${table.name}) between 1 and 80`,
		),
		check(
			"payment_methods_color_key_check",
			sql`${table.colorKey} in ('emerald', 'cyan', 'violet', 'blue', 'orange', 'amber', 'rose', 'teal', 'indigo', 'pink', 'lime', 'red', 'sky', 'fuchsia', 'slate')`,
		),
		check(
			"payment_methods_icon_key_check",
			sql`${table.iconKey} in ('BriefcaseBusiness', 'CircleDollarSign', 'Gift', 'House', 'Utensils', 'Car', 'HeartPulse', 'Gamepad2', 'Tags', 'WalletCards', 'GraduationCap', 'ShoppingBag', 'Banknote', 'Dumbbell', 'PiggyBank', 'Plane', 'ReceiptText', 'Smartphone', 'TrendingUp', 'Coffee', 'Shirt', 'BookOpen', 'Dog', 'Bus', 'Music', 'CreditCard', 'Landmark', 'QrCode', 'Building2', 'BadgeDollarSign', 'Bitcoin', 'CircleEllipsis', 'Baby', 'Bike', 'Calculator', 'Camera', 'Cat', 'CirclePlay', 'ClipboardList', 'Fuel', 'Hotel', 'PawPrint', 'ShoppingCart', 'Stethoscope', 'Ticket', 'Tv', 'Wrench', 'Bird', 'Fish', 'Rabbit', 'Turtle', 'Flower2', 'Trees', 'ChefHat', 'Bath', 'Umbrella', 'BaggageClaim', 'Pill', 'Syringe', 'Laptop', 'Package', 'CatFace', 'CatSitting', 'CatPlay')`,
		),
		check(
			"payment_methods_invoice_configuration_check",
			sql`(${table.kind} = 'credit_card' and ${table.invoiceControl} = 1 and ${table.closingDay} between 1 and 31 and ${table.dueDay} between 1 and 31) or (${table.invoiceControl} = 0 and ${table.closingDay} is null and ${table.dueDay} is null)`,
		),
	],
);

export const transactions = sqliteTable(
	"transactions",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		categoryId: text("category_id").notNull(),
		paymentMethodId: text("payment_method_id"),
		type: text("type", { enum: ["income", "expense"] }).notNull(),
		amountCents: integer("amount_cents").notNull(),
		currency: text("currency").notNull().default("BRL"),
		occurredAt: text("occurred_at").notNull(),
		description: text("description"),
		invoiceCycleClosingDate: text("invoice_cycle_closing_date"),
		invoiceCycleDueDate: text("invoice_cycle_due_date"),
		archivedAt: integer("archived_at", { mode: "number" }),
		...financeTimestamps,
	},
	(table) => [
		index("transactions_history_index").on(
			table.userId,
			table.occurredAt,
			table.createdAt,
			table.id,
		),
		index("transactions_archive_index").on(
			table.userId,
			table.archivedAt,
			table.id,
		),
		index("transactions_payment_cycle_index").on(
			table.userId,
			table.paymentMethodId,
			table.invoiceCycleClosingDate,
			table.invoiceCycleDueDate,
		),
		foreignKey({
			columns: [table.categoryId, table.userId, table.type],
			foreignColumns: [categories.id, categories.userId, categories.type],
			name: "transactions_category_owner_type_fk",
		}),
		foreignKey({
			columns: [table.paymentMethodId, table.userId],
			foreignColumns: [paymentMethods.id, paymentMethods.userId],
			name: "transactions_payment_method_owner_fk",
		}),
		check(
			"transactions_type_check",
			sql`${table.type} in ('income', 'expense')`,
		),
		check(
			"transactions_amount_check",
			sql`${table.amountCents} > 0 and ${table.amountCents} <= 9007199254740991`,
		),
		check("transactions_currency_check", sql`${table.currency} = 'BRL'`),
		check(
			"transactions_description_check",
			sql`${table.description} is null or length(${table.description}) <= 280`,
		),
		check(
			"transactions_date_check",
			sql`${table.occurredAt} glob '????-??-??'`,
		),
	],
);

export const userRelations = relations(user, ({ many }) => ({
	categories: many(categories),
	paymentMethods: many(paymentMethods),
	transactions: many(transactions),
}));
