// biome-ignore-all lint/style/noNonNullAssertion: Lookups are guarded by the service's owned-record checks.
// biome-ignore-all lint/suspicious/noExplicitAny: The recursive report tree is serialized JSON.
import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { createDb } from "#/db";
import {
	categories,
	paymentMethods,
	transactions,
	userBootstrap,
} from "#/db/schema";
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
const paymentKind = z.enum([
	"credit_card",
	"debit_card",
	"pix",
	"cash",
	"bank_transfer",
	"boleto",
	"other",
]);
const civilDate = z.string().refine(isCivilDate, "Informe uma data válida.");
const nullablePaymentMethod = z.string().uuid().nullable();
const categoryInput = z.object({
	type: categoryType,
	name: z.string().trim().min(1).max(40),
	colorKey: z.enum(CATEGORY_COLORS),
	iconKey: z.enum(CATEGORY_ICONS),
	parentCategoryId: z.string().uuid().nullable().optional(),
});
const transactionInput = z.object({
	type: categoryType,
	categoryId: z.string().uuid(),
	paymentMethodId: nullablePaymentMethod.optional(),
	amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
	occurredAt: civilDate,
	description: z.string().trim().max(280).nullable().optional(),
});
const paymentMethodInput = z
	.object({
		name: z.string().trim().min(1).max(80),
		kind: paymentKind,
		colorKey: z.enum(CATEGORY_COLORS),
		iconKey: z.enum(CATEGORY_ICONS),
		invoiceControl: z.boolean().default(false),
		closingDay: z.number().int().min(1).max(31).nullable().optional(),
		dueDay: z.number().int().min(1).max(31).nullable().optional(),
	})
	.superRefine((value, ctx) => {
		const configured = value.kind === "credit_card" && value.invoiceControl;
		if (configured && (value.closingDay == null || value.dueDay == null))
			ctx.addIssue({
				code: "custom",
				message: "Informe fechamento e vencimento do cartão.",
			});
		if (!configured && (value.closingDay != null || value.dueDay != null))
			ctx.addIssue({
				code: "custom",
				message:
					"Fechamento e vencimento só são usados em cartão de crédito com fatura.",
			});
	});

type Database = ReturnType<typeof createDb>;
type CategoryType = z.infer<typeof categoryType>;
type PaymentKind = z.infer<typeof paymentKind>;
type Cursor = { occurredAt: string; createdAt: number; id: string };
type CategoryRow = typeof categories.$inferSelect;
type PaymentRow = typeof paymentMethods.$inferSelect;

export type CategoryDto = {
	id: string;
	type: CategoryType;
	name: string;
	colorKey: string;
	iconKey: string;
	parentCategoryId: string | null;
	level: 1 | 2 | 3;
	path: string[];
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
};
export type PaymentMethodDto = {
	id: string;
	name: string;
	kind: PaymentKind;
	colorKey: string;
	iconKey: string;
	invoiceControl: boolean;
	closingDay: number | null;
	dueDay: number | null;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
};
export type TransactionDto = {
	id: string;
	type: CategoryType;
	categoryId: string;
	category: CategoryDto;
	paymentMethodId: string | null;
	paymentMethod: PaymentMethodDto | null;
	amountCents: number;
	currency: "BRL";
	occurredAt: string;
	description: string | null;
	invoiceCycleClosingDate: string | null;
	invoiceCycleDueDate: string | null;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
};
export type InvoiceDto = {
	paymentMethodId: string;
	paymentMethod: PaymentMethodDto;
	cycleClosingDate: string;
	cycleDueDate: string;
	items: Array<{
		transactionId: string;
		occurredAt: string;
		description: string | null;
		amountCents: number;
		category: CategoryDto;
	}>;
	totalCents: number;
};

export const financeSchemas = {
	categoryInput,
	categoryUpdate: categoryInput
		.omit({ type: true })
		.extend({ id: z.string().uuid() }),
	transactionInput,
	transactionUpdate: transactionInput.extend({
		id: z.string().uuid(),
		paymentMethodId: nullablePaymentMethod,
	}),
	paymentMethodInput,
	paymentMethodUpdate: paymentMethodInput.extend({ id: z.string().uuid() }),
	id: z.object({ id: z.string().uuid() }),
	listCategories: z.object({
		status: z.enum(["active", "archived"]).default("active"),
	}),
	listPaymentMethods: z.object({
		status: z.enum(["active", "archived", "all"]).default("active"),
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

const now = () => Date.now();
const iso = (value: number | null) =>
	value === null ? null : new Date(value).toISOString();
const idSchema = z.string().uuid();
function encodeCursor(cursor: Cursor) {
	return btoa(JSON.stringify(cursor));
}
function decodeCursor(value?: string): Cursor | undefined {
	if (!value) return undefined;
	try {
		return z
			.object({
				occurredAt: civilDate,
				createdAt: z.number().int(),
				id: idSchema,
			})
			.parse(JSON.parse(atob(value)));
	} catch {
		throw new FinanceError("VALIDATION_ERROR", "Cursor inválido.");
	}
}
function monthDate(year: number, month: number, day: number) {
	const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
function shiftMonth(year: number, month: number, amount: number) {
	const date = new Date(Date.UTC(year, month - 1 + amount, 1));
	return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
export function invoiceCycleFor(
	occurredAt: string,
	closingDay: number,
	dueDay: number,
) {
	const [year, month] = occurredAt.split("-").map(Number);
	const currentClosing = monthDate(year, month, closingDay);
	const closing =
		occurredAt <= currentClosing
			? currentClosing
			: (() => {
					const next = shiftMonth(year, month, 1);
					return monthDate(next.year, next.month, closingDay);
				})();
	const [closingYear, closingMonth] = closing.split("-").map(Number);
	let due = monthDate(closingYear, closingMonth, dueDay);
	if (due <= closing) {
		const next = shiftMonth(closingYear, closingMonth, 1);
		due = monthDate(next.year, next.month, dueDay);
	}
	return { closingDate: closing, dueDate: due };
}
function paymentDto(row: PaymentRow): PaymentMethodDto {
	return {
		id: row.id,
		name: row.name,
		kind: row.kind as PaymentKind,
		colorKey: row.colorKey,
		iconKey: row.iconKey,
		invoiceControl: row.invoiceControl,
		closingDay: row.closingDay,
		dueDay: row.dueDay,
		archivedAt: iso(row.archivedAt),
		createdAt: new Date(row.createdAt).toISOString(),
		updatedAt: new Date(row.updatedAt).toISOString(),
	};
}
function categoryDtos(rows: CategoryRow[]) {
	const byId = new Map(rows.map((row) => [row.id, row]));
	const cache = new Map<string, string[]>();
	function path(row: CategoryRow, seen = new Set<string>()): string[] {
		const cached = cache.get(row.id);
		if (cached) return cached;
		if (seen.has(row.id)) return [row.id];
		const parent = row.parentCategoryId
			? byId.get(row.parentCategoryId)
			: undefined;
		const next = parent
			? [...path(parent, new Set([...seen, row.id])), row.id]
			: [row.id];
		cache.set(row.id, next);
		return next;
	}
	return new Map(
		rows.map((row) => {
			const itemPath = path(row);
			if (itemPath.length > 3)
				throw new FinanceError(
					"CONFLICT",
					"Categorias aceitam no máximo três níveis.",
				);
			const dto: CategoryDto = {
				id: row.id,
				type: row.type as CategoryType,
				name: row.name,
				colorKey: row.colorKey,
				iconKey: row.iconKey,
				parentCategoryId: row.parentCategoryId,
				level: itemPath.length as 1 | 2 | 3,
				path: itemPath,
				archivedAt: iso(row.archivedAt),
				createdAt: new Date(row.createdAt).toISOString(),
				updatedAt: new Date(row.updatedAt).toISOString(),
			};
			return [row.id, dto];
		}),
	);
}

async function bootstrap(db: Database, d1: D1Database, userId: string) {
	const marker = await db
		.select({ userId: userBootstrap.userId })
		.from(userBootstrap)
		.where(eq(userBootstrap.userId, userId))
		.limit(1);
	if (!marker.length) {
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
			{
				type: "expense",
				name: "Transporte",
				colorKey: "amber",
				iconKey: "Car",
			},
			{
				type: "expense",
				name: "Saúde",
				colorKey: "rose",
				iconKey: "HeartPulse",
			},
			{
				type: "expense",
				name: "Lazer",
				colorKey: "violet",
				iconKey: "Gamepad2",
			},
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

	const existingMethods = await db
		.select({ kind: paymentMethods.kind })
		.from(paymentMethods)
		.where(eq(paymentMethods.userId, userId));
	const existingKinds = new Set(existingMethods.map((method) => method.kind));
	const paymentDefaults: Array<{
		name: string;
		kind: PaymentKind;
		colorKey: string;
		iconKey: string;
	}> = [
		{
			name: "Dinheiro",
			kind: "cash",
			colorKey: "emerald",
			iconKey: "Banknote",
		},
		{ name: "Pix", kind: "pix", colorKey: "teal", iconKey: "QrCode" },
		{
			name: "Crédito",
			kind: "credit_card",
			colorKey: "indigo",
			iconKey: "CreditCard",
		},
		{
			name: "Débito",
			kind: "debit_card",
			colorKey: "blue",
			iconKey: "WalletCards",
		},
	];
	const missingDefaults = paymentDefaults.filter(
		(method) => !existingKinds.has(method.kind),
	);
	if (!missingDefaults.length) return;
	const timestamp = now();
	await d1.batch(
		missingDefaults.map((method) =>
			d1
				.prepare(
					"insert into payment_methods (id, user_id, name, kind, color_key, icon_key, invoice_control, closing_day, due_day, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				)
				.bind(
					crypto.randomUUID(),
					userId,
					method.name,
					method.kind,
					method.colorKey,
					method.iconKey,
					false,
					null,
					null,
					timestamp,
					timestamp,
				),
		),
	);
}

async function ownedCategory(
	db: Database,
	userId: string,
	id: string,
	type?: CategoryType,
) {
	const filters = [eq(categories.id, id), eq(categories.userId, userId)];
	if (type) filters.push(eq(categories.type, type));
	const row = (
		await db
			.select()
			.from(categories)
			.where(and(...filters))
			.limit(1)
	)[0];
	if (!row) throw new FinanceError("NOT_FOUND", "Categoria não encontrada.");
	return row;
}
async function ownedPaymentMethod(db: Database, userId: string, id: string) {
	const row = (
		await db
			.select()
			.from(paymentMethods)
			.where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)))
			.limit(1)
	)[0];
	if (!row)
		throw new FinanceError("NOT_FOUND", "Forma de pagamento não encontrada.");
	return row;
}
async function categoryMap(db: Database, userId: string) {
	return categoryDtos(
		await db.select().from(categories).where(eq(categories.userId, userId)),
	);
}
async function transactionDto(
	db: Database,
	userId: string,
	id: string,
): Promise<TransactionDto> {
	const row = (
		await db
			.select({
				transaction: transactions,
				category: categories,
				paymentMethod: paymentMethods,
			})
			.from(transactions)
			.innerJoin(
				categories,
				and(
					eq(transactions.categoryId, categories.id),
					eq(transactions.userId, categories.userId),
					eq(transactions.type, categories.type),
				),
			)
			.leftJoin(
				paymentMethods,
				and(
					eq(transactions.paymentMethodId, paymentMethods.id),
					eq(transactions.userId, paymentMethods.userId),
				),
			)
			.where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
			.limit(1)
	)[0];
	if (!row) throw new FinanceError("NOT_FOUND", "Lançamento não encontrado.");
	const map = await categoryMap(db, userId);
	const category = map.get(row.category.id);
	if (!category)
		throw new FinanceError("NOT_FOUND", "Categoria não encontrada.");
	return {
		id: row.transaction.id,
		type: row.transaction.type as CategoryType,
		categoryId: row.transaction.categoryId,
		category,
		paymentMethodId: row.transaction.paymentMethodId,
		paymentMethod: row.paymentMethod ? paymentDto(row.paymentMethod) : null,
		amountCents: row.transaction.amountCents,
		currency: "BRL",
		occurredAt: row.transaction.occurredAt,
		description: row.transaction.description,
		invoiceCycleClosingDate: row.transaction.invoiceCycleClosingDate,
		invoiceCycleDueDate: row.transaction.invoiceCycleDueDate,
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
	async function validateParent(
		id: string,
		type: CategoryType,
		parentCategoryId: string | null | undefined,
		selfId?: string,
	) {
		if (!parentCategoryId) return null;
		const parent = await ownedCategory(db, id, parentCategoryId, type);
		if (parent.archivedAt)
			throw new FinanceError(
				"CONFLICT",
				"Categoria pai arquivada não pode receber filhos.",
			);
		if (parent.id === selfId)
			throw new FinanceError(
				"CONFLICT",
				"Uma categoria não pode ser pai de si mesma.",
			);
		const all = await db
			.select()
			.from(categories)
			.where(eq(categories.userId, id));
		const map = new Map(all.map((item) => [item.id, item]));
		let cursor: CategoryRow | undefined = parent;
		let level = 1;
		const seen = new Set<string>(selfId ? [selfId] : []);
		while (cursor) {
			if (seen.has(cursor.id))
				throw new FinanceError(
					"CONFLICT",
					"A categoria não pode formar um ciclo.",
				);
			seen.add(cursor.id);
			level += 1;
			cursor = cursor.parentCategoryId
				? map.get(cursor.parentCategoryId)
				: undefined;
		}
		if (level > 3)
			throw new FinanceError(
				"CONFLICT",
				"Categorias aceitam no máximo três níveis.",
			);
		return parent;
	}
	async function hasActiveDescendant(id: string, categoryId: string) {
		const all = await db
			.select()
			.from(categories)
			.where(eq(categories.userId, id));
		const children = new Map<string, CategoryRow[]>();
		for (const item of all)
			if (item.parentCategoryId)
				children.set(item.parentCategoryId, [
					...(children.get(item.parentCategoryId) ?? []),
					item,
				]);
		const walk = (current: string): boolean =>
			(children.get(current) ?? []).some(
				(child) => child.archivedAt === null || walk(child.id),
			);
		return walk(categoryId);
	}
	async function validateSubtreeDepth(
		id: string,
		categoryId: string,
		parentCategoryId: string | null,
	) {
		const all = await db
			.select()
			.from(categories)
			.where(eq(categories.userId, id));
		const byId = new Map(all.map((item) => [item.id, item]));
		const children = new Map<string, CategoryRow[]>();
		for (const item of all) {
			if (!item.parentCategoryId) continue;
			children.set(item.parentCategoryId, [
				...(children.get(item.parentCategoryId) ?? []),
				item,
			]);
		}
		let parentDepth = 0;
		let cursor = parentCategoryId ? byId.get(parentCategoryId) : undefined;
		const ancestors = new Set<string>([categoryId]);
		while (cursor) {
			if (ancestors.has(cursor.id))
				throw new FinanceError(
					"CONFLICT",
					"A categoria não pode formar um ciclo.",
				);
			ancestors.add(cursor.id);
			parentDepth += 1;
			cursor = cursor.parentCategoryId
				? byId.get(cursor.parentCategoryId)
				: undefined;
		}
		const maxRelativeDepth = (current: string, relativeDepth: number): number =>
			(children.get(current) ?? []).reduce(
				(max, child) =>
					Math.max(max, maxRelativeDepth(child.id, relativeDepth + 1)),
				relativeDepth,
			);
		if (parentDepth + maxRelativeDepth(categoryId, 1) > 3)
			throw new FinanceError(
				"CONFLICT",
				"Mover esta categoria deixaria um descendente acima do terceiro nível.",
			);
	}
	async function cycleSnapshot(
		type: CategoryType,
		occurredAt: string,
		method: PaymentRow | null,
	) {
		if (
			type !== "expense" ||
			!method ||
			method.kind !== "credit_card" ||
			!method.invoiceControl ||
			!method.closingDay ||
			!method.dueDay
		)
			return { closingDate: null, dueDate: null };
		return invoiceCycleFor(occurredAt, method.closingDay, method.dueDay);
	}
	return {
		async getSessionUser() {
			const current = await session;
			if (!current?.user)
				throw new FinanceError("UNAUTHENTICATED", "Faça login para continuar.");

			return {
				id: current.user.id,
				name: current.user.name,
				email: current.user.email,
				image: current.user.image,
			};
		},
		async listCategories(data: z.infer<typeof financeSchemas.listCategories>) {
			const id = await userId();
			await bootstrap(db, d1, id);
			const all = await db
				.select()
				.from(categories)
				.where(eq(categories.userId, id));
			const result = categoryDtos(all);
			return all
				.filter((row) =>
					data.status === "active"
						? row.archivedAt === null
						: row.archivedAt !== null,
				)
				.map((row) => result.get(row.id)!)
				.sort(
					(a, b) =>
						a.type.localeCompare(b.type) ||
						a.path.join("/").localeCompare(b.path.join("/")),
				);
		},
		async createCategory(data: z.infer<typeof categoryInput>) {
			const id = await userId();
			const parentCategoryId = data.parentCategoryId ?? null;
			await validateParent(id, data.type, parentCategoryId);
			const normalizedName = normalizeCategoryName(data.name);
			const duplicate = (
				await db
					.select()
					.from(categories)
					.where(
						and(
							eq(categories.userId, id),
							eq(categories.type, data.type),
							eq(categories.normalizedName, normalizedName),
							parentCategoryId
								? eq(categories.parentCategoryId, parentCategoryId)
								: isNull(categories.parentCategoryId),
						),
					)
					.limit(1)
			)[0];
			if (duplicate?.archivedAt === null)
				throw new FinanceError(
					"CONFLICT",
					"Já existe uma categoria com este nome neste nível.",
				);
			const timestamp = now();
			if (duplicate) {
				await db
					.update(categories)
					.set({
						name: data.name,
						colorKey: data.colorKey,
						iconKey: data.iconKey,
						archivedAt: null,
						updatedAt: timestamp,
					})
					.where(eq(categories.id, duplicate.id));
				return (await categoryMap(db, id)).get(duplicate.id)!;
			}
			const categoryId = crypto.randomUUID();
			await db.insert(categories).values({
				id: categoryId,
				userId: id,
				type: data.type,
				name: data.name,
				normalizedName,
				colorKey: data.colorKey,
				iconKey: data.iconKey,
				parentCategoryId,
				createdAt: timestamp,
				updatedAt: timestamp,
			});
			return (await categoryMap(db, id)).get(categoryId)!;
		},
		async updateCategory(data: z.infer<typeof financeSchemas.categoryUpdate>) {
			const id = await userId();
			const previous = await ownedCategory(db, id, data.id);
			const parentCategoryId =
				data.parentCategoryId === undefined
					? previous.parentCategoryId
					: data.parentCategoryId;
			await validateParent(
				id,
				previous.type as CategoryType,
				parentCategoryId,
				previous.id,
			);
			if (
				parentCategoryId !== previous.parentCategoryId &&
				(await hasActiveDescendant(id, previous.id))
			)
				throw new FinanceError(
					"CONFLICT",
					"Não mova categoria com descendente ativo.",
				);
			if (parentCategoryId !== previous.parentCategoryId)
				await validateSubtreeDepth(id, previous.id, parentCategoryId);
			const normalizedName = normalizeCategoryName(data.name);
			const duplicate = (
				await db
					.select({ id: categories.id })
					.from(categories)
					.where(
						and(
							eq(categories.userId, id),
							eq(categories.type, previous.type),
							eq(categories.normalizedName, normalizedName),
							parentCategoryId
								? eq(categories.parentCategoryId, parentCategoryId)
								: isNull(categories.parentCategoryId),
						),
					)
					.limit(1)
			)[0];
			if (duplicate && duplicate.id !== previous.id)
				throw new FinanceError(
					"CONFLICT",
					"Já existe uma categoria com este nome neste nível.",
				);
			await db
				.update(categories)
				.set({
					name: data.name,
					normalizedName,
					colorKey: data.colorKey,
					iconKey: data.iconKey,
					parentCategoryId,
					updatedAt: now(),
				})
				.where(eq(categories.id, previous.id));
			return (await categoryMap(db, id)).get(previous.id)!;
		},
		async archiveCategory(data: z.infer<typeof financeSchemas.id>) {
			const id = await userId();
			await ownedCategory(db, id, data.id);
			if (await hasActiveDescendant(id, data.id))
				throw new FinanceError(
					"CONFLICT",
					"Arquive os descendentes antes da categoria.",
				);
			await db
				.update(categories)
				.set({ archivedAt: now(), updatedAt: now() })
				.where(and(eq(categories.id, data.id), eq(categories.userId, id)));
			return { id: data.id };
		},
		async restoreCategory(data: z.infer<typeof financeSchemas.id>) {
			const id = await userId();
			const category = await ownedCategory(db, id, data.id);
			if (category.parentCategoryId) {
				const parent = await ownedCategory(
					db,
					id,
					category.parentCategoryId,
					category.type as CategoryType,
				);
				if (parent.archivedAt)
					throw new FinanceError(
						"CONFLICT",
						"Restaure primeiro as categorias ancestrais.",
					);
			}
			await validateSubtreeDepth(id, category.id, category.parentCategoryId);
			await db
				.update(categories)
				.set({ archivedAt: null, updatedAt: now() })
				.where(eq(categories.id, data.id));
			return { id: data.id };
		},
		async listPaymentMethods(
			data: z.infer<typeof financeSchemas.listPaymentMethods>,
		) {
			const id = await userId();
			await bootstrap(db, d1, id);
			const rows = await db
				.select()
				.from(paymentMethods)
				.where(
					and(
						eq(paymentMethods.userId, id),
						data.status === "active"
							? isNull(paymentMethods.archivedAt)
							: data.status === "archived"
								? sql`${paymentMethods.archivedAt} is not null`
								: undefined,
					),
				)
				.orderBy(paymentMethods.name);
			return rows.map(paymentDto);
		},
		async createPaymentMethod(data: z.infer<typeof paymentMethodInput>) {
			const id = await userId();
			const timestamp = now();
			const methodId = crypto.randomUUID();
			const configured = data.kind === "credit_card" && data.invoiceControl;
			await db.insert(paymentMethods).values({
				id: methodId,
				userId: id,
				name: data.name,
				kind: data.kind,
				colorKey: data.colorKey,
				iconKey: data.iconKey,
				invoiceControl: configured,
				closingDay: configured ? data.closingDay! : null,
				dueDay: configured ? data.dueDay! : null,
				createdAt: timestamp,
				updatedAt: timestamp,
			});
			return paymentDto(await ownedPaymentMethod(db, id, methodId));
		},
		async updatePaymentMethod(
			data: z.infer<typeof financeSchemas.paymentMethodUpdate>,
		) {
			const id = await userId();
			await ownedPaymentMethod(db, id, data.id);
			const configured = data.kind === "credit_card" && data.invoiceControl;
			await db
				.update(paymentMethods)
				.set({
					name: data.name,
					kind: data.kind,
					colorKey: data.colorKey,
					iconKey: data.iconKey,
					invoiceControl: configured,
					closingDay: configured ? data.closingDay! : null,
					dueDay: configured ? data.dueDay! : null,
					updatedAt: now(),
				})
				.where(eq(paymentMethods.id, data.id));
			return paymentDto(await ownedPaymentMethod(db, id, data.id));
		},
		async archivePaymentMethod(data: z.infer<typeof financeSchemas.id>) {
			const id = await userId();
			await ownedPaymentMethod(db, id, data.id);
			await db
				.update(paymentMethods)
				.set({ archivedAt: now(), updatedAt: now() })
				.where(eq(paymentMethods.id, data.id));
			return { id: data.id };
		},
		async restorePaymentMethod(data: z.infer<typeof financeSchemas.id>) {
			const id = await userId();
			await ownedPaymentMethod(db, id, data.id);
			await db
				.update(paymentMethods)
				.set({ archivedAt: null, updatedAt: now() })
				.where(eq(paymentMethods.id, data.id));
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
			const paymentMethodId = data.paymentMethodId ?? null;
			const method = paymentMethodId
				? await ownedPaymentMethod(db, id, paymentMethodId)
				: null;
			if (method?.archivedAt)
				throw new FinanceError(
					"CONFLICT",
					"Forma de pagamento arquivada não pode receber novos lançamentos.",
				);
			const snapshot = await cycleSnapshot(data.type, data.occurredAt, method);
			const timestamp = now();
			const transactionId = crypto.randomUUID();
			await db.insert(transactions).values({
				id: transactionId,
				userId: id,
				type: data.type,
				categoryId: data.categoryId,
				paymentMethodId,
				amountCents: data.amountCents,
				occurredAt: data.occurredAt,
				description: data.description || null,
				invoiceCycleClosingDate: snapshot.closingDate,
				invoiceCycleDueDate: snapshot.dueDate,
				createdAt: timestamp,
				updatedAt: timestamp,
			});
			return transactionDto(db, id, transactionId);
		},
		async updateTransaction(
			data: z.infer<typeof financeSchemas.transactionUpdate>,
		) {
			const id = await userId();
			const current = (
				await db
					.select()
					.from(transactions)
					.where(and(eq(transactions.id, data.id), eq(transactions.userId, id)))
					.limit(1)
			)[0];
			if (!current)
				throw new FinanceError("NOT_FOUND", "Lançamento não encontrado.");
			const category = await ownedCategory(db, id, data.categoryId, data.type);
			if (category.archivedAt)
				throw new FinanceError(
					"CONFLICT",
					"Categoria arquivada não pode receber lançamentos.",
				);
			let method: PaymentRow | null = null;
			if (data.paymentMethodId) {
				method = await ownedPaymentMethod(db, id, data.paymentMethodId);
				if (
					method.archivedAt &&
					data.paymentMethodId !== current.paymentMethodId
				)
					throw new FinanceError(
						"CONFLICT",
						"Forma de pagamento arquivada não pode receber novos lançamentos.",
					);
			}
			const snapshot = await cycleSnapshot(data.type, data.occurredAt, method);
			await db
				.update(transactions)
				.set({
					type: data.type,
					categoryId: data.categoryId,
					paymentMethodId: data.paymentMethodId,
					amountCents: data.amountCents,
					occurredAt: data.occurredAt,
					description: data.description || null,
					invoiceCycleClosingDate: snapshot.closingDate,
					invoiceCycleDueDate: snapshot.dueDate,
					updatedAt: now(),
				})
				.where(eq(transactions.id, data.id));
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
					rows.length > 30 && page.length
						? encodeCursor(page[page.length - 1])
						: null,
			};
		},
		async listInvoices() {
			const id = await userId();
			const rows = await db
				.select({
					transaction: transactions,
					category: categories,
					paymentMethod: paymentMethods,
				})
				.from(transactions)
				.innerJoin(
					categories,
					and(
						eq(transactions.categoryId, categories.id),
						eq(transactions.userId, categories.userId),
						eq(transactions.type, categories.type),
					),
				)
				.innerJoin(
					paymentMethods,
					and(
						eq(transactions.paymentMethodId, paymentMethods.id),
						eq(transactions.userId, paymentMethods.userId),
					),
				)
				.where(
					and(
						eq(transactions.userId, id),
						isNull(transactions.archivedAt),
						sql`${transactions.invoiceCycleClosingDate} is not null`,
						sql`${transactions.invoiceCycleDueDate} is not null`,
					),
				);
			const map = await categoryMap(db, id);
			const grouped = new Map<string, InvoiceDto>();
			for (const row of rows) {
				const key = `${row.transaction.paymentMethodId}|${row.transaction.invoiceCycleClosingDate}|${row.transaction.invoiceCycleDueDate}`;
				const invoice = grouped.get(key) ?? {
					paymentMethodId: row.paymentMethod.id,
					paymentMethod: paymentDto(row.paymentMethod),
					cycleClosingDate: row.transaction.invoiceCycleClosingDate!,
					cycleDueDate: row.transaction.invoiceCycleDueDate!,
					items: [],
					totalCents: 0,
				};
				invoice.items.push({
					transactionId: row.transaction.id,
					occurredAt: row.transaction.occurredAt,
					description: row.transaction.description,
					amountCents: row.transaction.amountCents,
					category: map.get(row.category.id)!,
				});
				invoice.totalCents += row.transaction.amountCents;
				grouped.set(key, invoice);
			}
			return [...grouped.values()].sort((a, b) =>
				b.cycleClosingDate.localeCompare(a.cycleClosingDate),
			);
		},
		async getDashboard() {
			const id = await userId();
			await bootstrap(db, d1, id);
			const { startDate, endDate } = periodFor("month", saoPauloToday());
			const rows = await db
				.select({ transaction: transactions, paymentMethod: paymentMethods })
				.from(transactions)
				.leftJoin(
					paymentMethods,
					and(
						eq(transactions.paymentMethodId, paymentMethods.id),
						eq(transactions.userId, paymentMethods.userId),
					),
				)
				.where(
					and(
						eq(transactions.userId, id),
						isNull(transactions.archivedAt),
						gte(transactions.occurredAt, startDate),
						lt(transactions.occurredAt, endDate),
					),
				);
			const incomeCents = rows
				.filter((row) => row.transaction.type === "income")
				.reduce((sum, row) => sum + row.transaction.amountCents, 0);
			const expenseCents = rows
				.filter((row) => row.transaction.type === "expense")
				.reduce((sum, row) => sum + row.transaction.amountCents, 0);
			const byPayment = new Map<
				string,
				{ paymentMethodId: string | null; name: string; amountCents: number }
			>();
			for (const row of rows.filter(
				(item) => item.transaction.type === "income",
			)) {
				const key = row.paymentMethod?.id ?? "none";
				const item = byPayment.get(key) ?? {
					paymentMethodId: row.paymentMethod?.id ?? null,
					name: row.paymentMethod?.name ?? "Não informado",
					amountCents: 0,
				};
				item.amountCents += row.transaction.amountCents;
				byPayment.set(key, item);
			}
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
				incomeByPaymentMethod: [...byPayment.values()].sort(
					(a, b) => b.amountCents - a.amountCents,
				),
				recentTransactions: await Promise.all(
					recentIds.map((row) => transactionDto(db, id, row.id)),
				),
			};
		},
		async getReport(data: z.infer<typeof financeSchemas.report>) {
			const id = await userId();
			const period = periodFor(data.granularity, data.anchorDate);
			const rows = await db
				.select({
					transaction: transactions,
					category: categories,
					paymentMethod: paymentMethods,
				})
				.from(transactions)
				.innerJoin(
					categories,
					and(
						eq(transactions.categoryId, categories.id),
						eq(transactions.userId, categories.userId),
						eq(transactions.type, categories.type),
					),
				)
				.leftJoin(
					paymentMethods,
					and(
						eq(transactions.paymentMethodId, paymentMethods.id),
						eq(transactions.userId, paymentMethods.userId),
					),
				)
				.where(
					and(
						eq(transactions.userId, id),
						isNull(transactions.archivedAt),
						gte(transactions.occurredAt, period.startDate),
						lt(transactions.occurredAt, period.endDate),
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
			const map = await categoryMap(db, id);
			const direct = new Map<string, number>();
			for (const row of expenseRows)
				direct.set(
					row.category.id,
					(direct.get(row.category.id) ?? 0) + row.transaction.amountCents,
				);
			const nodes = new Map<
				string,
				{
					category: CategoryDto;
					directAmountCents: number;
					aggregateAmountCents: number;
					children: any[];
				}
			>();
			for (const [categoryId, amount] of direct) {
				let category = map.get(categoryId);
				while (category) {
					const node = nodes.get(category.id) ?? {
						category,
						directAmountCents: 0,
						aggregateAmountCents: 0,
						children: [],
					};
					node.aggregateAmountCents += amount;
					if (category.id === categoryId) node.directAmountCents += amount;
					nodes.set(category.id, node);
					category = category.parentCategoryId
						? map.get(category.parentCategoryId)
						: undefined;
				}
			}
			const roots: any[] = [];
			for (const node of nodes.values()) {
				const parent = node.category.parentCategoryId
					? nodes.get(node.category.parentCategoryId)
					: undefined;
				if (parent) parent.children.push(node);
				else roots.push(node);
			}
			const expenseByCategory = [...direct.entries()]
				.map(([categoryId, amountCents]) => {
					const category = map.get(categoryId)!;
					return {
						categoryId,
						categoryName: category.name,
						colorKey: category.colorKey,
						iconKey: category.iconKey,
						amountCents,
					};
				})
				.sort((a, b) => b.amountCents - a.amountCents);
			const income = new Map<
				string,
				{ paymentMethodId: string | null; name: string; amountCents: number }
			>();
			for (const row of rows.filter(
				(item) => item.transaction.type === "income",
			)) {
				const key = row.paymentMethod?.id ?? "none";
				const item = income.get(key) ?? {
					paymentMethodId: row.paymentMethod?.id ?? null,
					name: row.paymentMethod?.name ?? "Não informado",
					amountCents: 0,
				};
				item.amountCents += row.transaction.amountCents;
				income.set(key, item);
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
				expenseByCategory,
				expenseCategoryTree: roots,
				incomeByPaymentMethod: [...income.values()].sort(
					(a, b) => b.amountCents - a.amountCents,
				),
			};
		},
	};
}
