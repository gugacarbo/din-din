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
			sql`${table.iconKey} in ('BriefcaseBusiness', 'CircleDollarSign', 'Gift', 'House', 'Utensils', 'Car', 'HeartPulse', 'Gamepad2', 'Tags', 'WalletCards', 'GraduationCap', 'ShoppingBag', 'Banknote', 'Dumbbell', 'PiggyBank', 'Plane', 'ReceiptText', 'Smartphone', 'TrendingUp', 'Coffee', 'Shirt', 'BookOpen', 'Dog', 'Bus', 'Music', 'CreditCard', 'Landmark', 'QrCode', 'Building2', 'BadgeDollarSign', 'Bitcoin', 'CircleEllipsis')`,
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
			sql`${table.iconKey} in ('BriefcaseBusiness', 'CircleDollarSign', 'Gift', 'House', 'Utensils', 'Car', 'HeartPulse', 'Gamepad2', 'Tags', 'WalletCards', 'GraduationCap', 'ShoppingBag', 'Banknote', 'Dumbbell', 'PiggyBank', 'Plane', 'ReceiptText', 'Smartphone', 'TrendingUp', 'Coffee', 'Shirt', 'BookOpen', 'Dog', 'Bus', 'Music', 'CreditCard', 'Landmark', 'QrCode', 'Building2', 'BadgeDollarSign', 'Bitcoin', 'CircleEllipsis')`,
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
