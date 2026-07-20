import { and, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { createDb } from "#/db";
import { categories, transactions, userBootstrap } from "#/db/schema";
import { createCoreAuth } from "#/lib/auth-core";
import {
	CATEGORY_COLORS,
	CATEGORY_ICONS,
	isCivilDate,
	normalizeCategoryName,
	periodFor,
	saoPauloToday,
} from "#/lib/finance";

const categoryType = z.enum(["income", "expense"]);
const categoryInput = z.object({
	type: categoryType,
	name: z.string().trim().min(1).max(40),
	colorKey: z.enum(CATEGORY_COLORS),
	iconKey: z.enum(CATEGORY_ICONS),
});
const civilDate = z.string().refine(isCivilDate, "Informe uma data válida.");
const transactionInput = z.object({
	type: categoryType,
	categoryId: z.string().uuid(),
	amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	occurredAt: civilDate,
	description: z.string().trim().max(280).nullable().optional(),
});

type Database = ReturnType<typeof createDb>;
type CategoryType = z.infer<typeof categoryType>;
type Cursor = { occurredAt: string; createdAt: number; id: string };

export type CategoryDto = {
	id: string;
	type: CategoryType;
	name: string;
	colorKey: string;
	iconKey: string;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
};
export type TransactionDto = {
	id: string;
	type: CategoryType;
	categoryId: string;
	category: CategoryDto;
	amountCents: number;
	currency: "BRL";
	occurredAt: string;
	description: string | null;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export const financeSchemas = {
	categoryInput,
	categoryUpdate: categoryInput
		.omit({ type: true })
		.extend({ id: z.string().uuid() }),
	transactionInput,
	transactionUpdate: transactionInput.extend({ id: z.string().uuid() }),
	id: z.object({ id: z.string().uuid() }),
	listCategories: z.object({
		status: z.enum(["active", "archived"]).default("active"),
	}),
	listTransactions: z.object({
		scope: z.enum(["active", "archived"]).default("active"),
		cursor: z.string().optional(),
	}),
	report: z.object({
		granularity: z.enum(["day", "week", "month"]),
		anchorDate: civilDate,
	}),
};

export class FinanceError extends Error {
	constructor(
		readonly code:
			| "UNAUTHENTICATED"
			| "NOT_FOUND"
			| "CONFLICT"
			| "VALIDATION_ERROR",
		message: string,
	) {
		super(message);
	}
}

function now() {
	return Date.now();
}
function iso(value: number | null) {
	return value === null ? null : new Date(value).toISOString();
}
function categoryDto(row: typeof categories.$inferSelect): CategoryDto {
	return {
		id: row.id,
		type: row.type,
		name: row.name,
		colorKey: row.colorKey,
		iconKey: row.iconKey,
		archivedAt: iso(row.archivedAt),
		createdAt: new Date(row.createdAt).toISOString(),
		updatedAt: new Date(row.updatedAt).toISOString(),
	};
}
function encodeCursor(cursor: Cursor) {
	return btoa(JSON.stringify(cursor));
}
function decodeCursor(value?: string): Cursor | undefined {
	if (!value) return undefined;
	try {
		const parsed = z
			.object({
				occurredAt: civilDate,
				createdAt: z.number().int(),
				id: z.string().uuid(),
			})
			.parse(JSON.parse(atob(value)));
		return parsed;
	} catch {
		throw new FinanceError("VALIDATION_ERROR", "Cursor inválido.");
	}
}

async function bootstrap(db: Database, d1: D1Database, userId: string) {
	const marker = await db
		.select({ userId: userBootstrap.userId })
		.from(userBootstrap)
		.where(eq(userBootstrap.userId, userId))
		.limit(1);
	if (marker.length) return;
	const defaults: Array<{
		type: CategoryType;
		name: string;
		colorKey: string;
		iconKey: string;
	}> = [
		{
			type: "income",
			name: "Salário",
			colorKey: "emerald",
			iconKey: "BriefcaseBusiness",
		},
		{
			type: "income",
			name: "Extra",
			colorKey: "cyan",
			iconKey: "CircleDollarSign",
		},
		{ type: "income", name: "Outros", colorKey: "violet", iconKey: "Gift" },
		{ type: "expense", name: "Moradia", colorKey: "blue", iconKey: "House" },
		{
			type: "expense",
			name: "Alimentação",
			colorKey: "orange",
			iconKey: "Utensils",
		},
		{ type: "expense", name: "Transporte", colorKey: "amber", iconKey: "Car" },
		{ type: "expense", name: "Saúde", colorKey: "rose", iconKey: "HeartPulse" },
		{ type: "expense", name: "Lazer", colorKey: "violet", iconKey: "Gamepad2" },
		{ type: "expense", name: "Outros", colorKey: "teal", iconKey: "Tags" },
	];
	const timestamp = now();
	const statements = defaults.map((item) =>
		d1
			.prepare(
				"insert or ignore into categories (id, user_id, type, name, normalized_name, color_key, icon_key, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.bind(
				crypto.randomUUID(),
				userId,
				item.type,
				item.name,
				normalizeCategoryName(item.name),
				item.colorKey,
				item.iconKey,
				timestamp,
				timestamp,
			),
	);
	statements.push(
		d1
			.prepare(
				"insert or ignore into user_bootstrap (user_id, seeded_at) values (?, ?)",
			)
			.bind(userId, timestamp),
	);
	await d1.batch(statements);
}

async function ownedCategory(
	db: Database,
	userId: string,
	id: string,
	type?: CategoryType,
) {
	const filters = [eq(categories.id, id), eq(categories.userId, userId)];
	if (type) filters.push(eq(categories.type, type));
	const rows = await db
		.select()
		.from(categories)
		.where(and(...filters))
		.limit(1);
	if (!rows[0])
		throw new FinanceError("NOT_FOUND", "Categoria não encontrada.");
	return rows[0];
}

async function transactionDto(
	db: Database,
	userId: string,
	id: string,
): Promise<TransactionDto> {
	const rows = await db
		.select({ transaction: transactions, category: categories })
		.from(transactions)
		.innerJoin(
			categories,
			and(
				eq(transactions.categoryId, categories.id),
				eq(transactions.userId, categories.userId),
				eq(transactions.type, categories.type),
			),
		)
		.where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
		.limit(1);
	const row = rows[0];
	if (!row) throw new FinanceError("NOT_FOUND", "Lançamento não encontrado.");
	return {
		id: row.transaction.id,
		type: row.transaction.type,
		categoryId: row.transaction.categoryId,
		category: categoryDto(row.category),
		amountCents: row.transaction.amountCents,
		currency: "BRL",
		occurredAt: row.transaction.occurredAt,
		description: row.transaction.description,
		archivedAt: iso(row.transaction.archivedAt),
		createdAt: new Date(row.transaction.createdAt).toISOString(),
		updatedAt: new Date(row.transaction.updatedAt).toISOString(),
	};
}

export function createFinanceService({
	d1,
	headers,
}: {
	d1: D1Database;
	headers: Headers;
}) {
	const db = createDb(d1);
	const auth = createCoreAuth(d1);
	const session = auth.api.getSession({ headers });

	async function userId() {
		const current = await session;
		if (!current?.user)
			throw new FinanceError("UNAUTHENTICATED", "Faça login para continuar.");
		return current.user.id;
	}

	return {
		async getSessionUser() {
			return { id: await userId() };
		},
		async listCategories(data: z.infer<typeof financeSchemas.listCategories>) {
			const id = await userId();
			await bootstrap(db, d1, id);
			const archived =
				data.status === "active"
					? isNull(categories.archivedAt)
					: sql`${categories.archivedAt} is not null`;
			return (
				await db
					.select()
					.from(categories)
					.where(and(eq(categories.userId, id), archived))
					.orderBy(categories.type, categories.name)
			).map(categoryDto);
		},
		async createCategory(data: z.infer<typeof categoryInput>) {
			const id = await userId();
			const normalizedName = normalizeCategoryName(data.name);
			const timestamp = now();
			const existing = await db
				.select()
				.from(categories)
				.where(
					and(
						eq(categories.userId, id),
						eq(categories.type, data.type),
						eq(categories.normalizedName, normalizedName),
					),
				)
				.limit(1);
			if (existing[0]?.archivedAt === null)
				throw new FinanceError(
					"CONFLICT",
					"Já existe uma categoria com este nome.",
				);
			if (existing[0]) {
				await db
					.update(categories)
					.set({
						name: data.name,
						colorKey: data.colorKey,
						iconKey: data.iconKey,
						archivedAt: null,
						updatedAt: timestamp,
					})
					.where(eq(categories.id, existing[0].id));
				return categoryDto(await ownedCategory(db, id, existing[0].id));
			}
			const categoryId = crypto.randomUUID();
			await db.insert(categories).values({
				id: categoryId,
				userId: id,
				...data,
				normalizedName,
				createdAt: timestamp,
				updatedAt: timestamp,
			});
			return categoryDto(await ownedCategory(db, id, categoryId));
		},
		async updateCategory(data: z.infer<typeof financeSchemas.categoryUpdate>) {
			const id = await userId();
			const previous = await ownedCategory(db, id, data.id);
			const normalizedName = normalizeCategoryName(data.name);
			const duplicate = await db
				.select({ id: categories.id })
				.from(categories)
				.where(
					and(
						eq(categories.userId, id),
						eq(categories.type, previous.type),
						eq(categories.normalizedName, normalizedName),
					),
				)
				.limit(1);
			if (duplicate[0] && duplicate[0].id !== previous.id)
				throw new FinanceError(
					"CONFLICT",
					"Já existe uma categoria com este nome.",
				);
			await db
				.update(categories)
				.set({
					name: data.name,
					normalizedName,
					colorKey: data.colorKey,
					iconKey: data.iconKey,
					updatedAt: now(),
				})
				.where(and(eq(categories.id, previous.id), eq(categories.userId, id)));
			return categoryDto(await ownedCategory(db, id, previous.id));
		},
		async archiveCategory(data: z.infer<typeof financeSchemas.id>) {
			const id = await userId();
			await ownedCategory(db, id, data.id);
			await db
				.update(categories)
				.set({ archivedAt: now(), updatedAt: now() })
				.where(and(eq(categories.id, data.id), eq(categories.userId, id)));
			return { id: data.id };
		},
		async restoreCategory(data: z.infer<typeof financeSchemas.id>) {
			const id = await userId();
			await ownedCategory(db, id, data.id);
			await db
				.update(categories)
				.set({ archivedAt: null, updatedAt: now() })
				.where(and(eq(categories.id, data.id), eq(categories.userId, id)));
			return { id: data.id };
		},
		async createTransaction(data: z.infer<typeof transactionInput>) {
			const id = await userId();
			const category = await ownedCategory(db, id, data.categoryId, data.type);
			if (category.archivedAt)
				throw new FinanceError(
					"CONFLICT",
					"Categoria arquivada não pode receber lançamentos.",
				);
			const timestamp = now();
			const transactionId = crypto.randomUUID();
			await db.insert(transactions).values({
				id: transactionId,
				userId: id,
				...data,
				description: data.description || null,
				createdAt: timestamp,
				updatedAt: timestamp,
			});
			return transactionDto(db, id, transactionId);
		},
		async updateTransaction(
			data: z.infer<typeof financeSchemas.transactionUpdate>,
		) {
			const id = await userId();
			const current = await db
				.select({ id: transactions.id })
				.from(transactions)
				.where(and(eq(transactions.id, data.id), eq(transactions.userId, id)))
				.limit(1);
			if (!current[0])
				throw new FinanceError("NOT_FOUND", "Lançamento não encontrado.");
			const category = await ownedCategory(db, id, data.categoryId, data.type);
			if (category.archivedAt)
				throw new FinanceError(
					"CONFLICT",
					"Categoria arquivada não pode receber lançamentos.",
				);
			await db
				.update(transactions)
				.set({
					type: data.type,
					categoryId: data.categoryId,
					amountCents: data.amountCents,
					occurredAt: data.occurredAt,
					description: data.description || null,
					updatedAt: now(),
				})
				.where(and(eq(transactions.id, data.id), eq(transactions.userId, id)));
			return transactionDto(db, id, data.id);
		},
		async archiveTransaction(data: z.infer<typeof financeSchemas.id>) {
			const id = await userId();
			const updated = await db
				.update(transactions)
				.set({ archivedAt: now(), updatedAt: now() })
				.where(and(eq(transactions.id, data.id), eq(transactions.userId, id)))
				.returning({ id: transactions.id });
			if (!updated[0])
				throw new FinanceError("NOT_FOUND", "Lançamento não encontrado.");
			return { id: data.id };
		},
		async restoreTransaction(data: z.infer<typeof financeSchemas.id>) {
			const id = await userId();
			const updated = await db
				.update(transactions)
				.set({ archivedAt: null, updatedAt: now() })
				.where(and(eq(transactions.id, data.id), eq(transactions.userId, id)))
				.returning({ id: transactions.id });
			if (!updated[0])
				throw new FinanceError("NOT_FOUND", "Lançamento não encontrado.");
			return { id: data.id };
		},
		async listTransactions(
			data: z.infer<typeof financeSchemas.listTransactions>,
		) {
			const id = await userId();
			const cursor = decodeCursor(data.cursor);
			const archived =
				data.scope === "active"
					? isNull(transactions.archivedAt)
					: sql`${transactions.archivedAt} is not null`;
			const after = cursor
				? or(
						lt(transactions.occurredAt, cursor.occurredAt),
						and(
							eq(transactions.occurredAt, cursor.occurredAt),
							lt(transactions.createdAt, cursor.createdAt),
						),
						and(
							eq(transactions.occurredAt, cursor.occurredAt),
							eq(transactions.createdAt, cursor.createdAt),
							lt(transactions.id, cursor.id),
						),
					)
				: undefined;
			const rows = await db
				.select({
					id: transactions.id,
					occurredAt: transactions.occurredAt,
					createdAt: transactions.createdAt,
				})
				.from(transactions)
				.where(and(eq(transactions.userId, id), archived, after))
				.orderBy(
					desc(transactions.occurredAt),
					desc(transactions.createdAt),
					desc(transactions.id),
				)
				.limit(31);
			const page = rows.slice(0, 30);
			return {
				items: await Promise.all(
					page.map((row) => transactionDto(db, id, row.id)),
				),
				nextCursor:
					rows.length > 30 && page.length > 0
						? encodeCursor(page[page.length - 1])
						: null,
			};
		},
		async getDashboard() {
			const id = await userId();
			await bootstrap(db, d1, id);
			const { startDate, endDate } = periodFor("month", saoPauloToday());
			const rows = await db
				.select({
					type: transactions.type,
					amountCents: transactions.amountCents,
				})
				.from(transactions)
				.where(
					and(
						eq(transactions.userId, id),
						isNull(transactions.archivedAt),
						gte(transactions.occurredAt, startDate),
						lte(transactions.occurredAt, endDate),
					),
				);
			const incomeCents = rows
				.filter((row) => row.type === "income")
				.reduce((sum, row) => sum + row.amountCents, 0);
			const expenseCents = rows
				.filter((row) => row.type === "expense")
				.reduce((sum, row) => sum + row.amountCents, 0);
			const recentIds = await db
				.select({ id: transactions.id })
				.from(transactions)
				.where(
					and(eq(transactions.userId, id), isNull(transactions.archivedAt)),
				)
				.orderBy(
					desc(transactions.occurredAt),
					desc(transactions.createdAt),
					desc(transactions.id),
				)
				.limit(5);
			return {
				month: {
					incomeCents,
					expenseCents,
					balanceCents: incomeCents - expenseCents,
				},
				recentTransactions: await Promise.all(
					recentIds.map((row) => transactionDto(db, id, row.id)),
				),
			};
		},
		async getReport(data: z.infer<typeof financeSchemas.report>) {
			const id = await userId();
			const period = periodFor(data.granularity, data.anchorDate);
			const rows = await db
				.select({ transaction: transactions, category: categories })
				.from(transactions)
				.innerJoin(
					categories,
					and(
						eq(transactions.categoryId, categories.id),
						eq(transactions.userId, categories.userId),
						eq(transactions.type, categories.type),
					),
				)
				.where(
					and(
						eq(transactions.userId, id),
						isNull(transactions.archivedAt),
						gte(transactions.occurredAt, period.startDate),
						lte(transactions.occurredAt, period.endDate),
					),
				);
			const incomeCents = rows
				.filter((row) => row.transaction.type === "income")
				.reduce((sum, row) => sum + row.transaction.amountCents, 0);
			const expenseRows = rows.filter(
				(row) => row.transaction.type === "expense",
			);
			const expenseCents = expenseRows.reduce(
				(sum, row) => sum + row.transaction.amountCents,
				0,
			);
			const groups = new Map<
				string,
				{
					categoryId: string;
					categoryName: string;
					colorKey: string;
					iconKey: string;
					amountCents: number;
				}
			>();
			for (const row of expenseRows) {
				const item = groups.get(row.category.id) || {
					categoryId: row.category.id,
					categoryName: row.category.name,
					colorKey: row.category.colorKey,
					iconKey: row.category.iconKey,
					amountCents: 0,
				};
				item.amountCents += row.transaction.amountCents;
				groups.set(row.category.id, item);
			}
			return {
				period: {
					granularity: data.granularity,
					anchorDate: data.anchorDate,
					...period,
				},
				incomeCents,
				expenseCents,
				balanceCents: incomeCents - expenseCents,
				expenseByCategory: [...groups.values()].sort(
					(a, b) => b.amountCents - a.amountCents,
				),
			};
		},
	};
}
