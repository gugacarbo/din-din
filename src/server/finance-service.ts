// biome-ignore-all lint/style/noNonNullAssertion: Lookups are guarded by the service's owned-record checks.
// biome-ignore-all lint/suspicious/noExplicitAny: The recursive report tree is serialized JSON.
import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { createDb } from "#/db";
import {
	categories,
	creditCardInvoicePayments,
	paymentMethods,
	transactionInstallments,
	transactions,
	userBootstrap,
} from "#/db/schema";
import { createCoreAuth } from "#/lib/auth-core";
import {
	CATEGORY_COLORS,
	CATEGORY_ICONS,
	invoiceCycleFor,
	invoiceCycleForReferenceMonth,
	isCivilDate,
	normalizeCategoryName,
	periodFor,
	saoPauloToday,
	shiftReferenceMonth,
	splitInstallmentAmounts,
} from "#/lib/finance";

export { invoiceCycleFor } from "#/lib/finance";

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
const referenceMonth = z
	.string()
	.regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe um mês de referência válido.");
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
	installmentCount: z.number().int().min(1).max(36).default(1),
	firstInvoiceReferenceMonth: referenceMonth.nullable().optional(),
});
const invoicePaymentInput = z.object({
	paymentMethodId: z.string().uuid(),
	referenceMonth,
	paidAt: civilDate,
	amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
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
	installmentPlan: {
		installmentCount: number;
		firstReferenceMonth: string;
		installments: Array<{
			number: number;
			amountCents: number;
			referenceMonth: string;
		}>;
	} | null;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
};
export type InvoicePaymentDto = {
	id: string;
	paymentMethodId: string;
	referenceMonth: string;
	paidAt: string;
	amountCents: number;
	cycleClosingDate: string;
	cycleDueDate: string;
	createdAt: string;
	updatedAt: string;
};
export type InvoiceDto = {
	paymentMethodId: string;
	paymentMethod: PaymentMethodDto;
	referenceMonth: string;
	cycleClosingDate: string;
	cycleDueDate: string;
	status: "projected" | "open" | "paid";
	payment: InvoicePaymentDto | null;
	items: Array<{
		transactionId: string;
		occurredAt: string;
		description: string | null;
		amountCents: number;
		category: CategoryDto;
		installmentNumber: number;
		installmentCount: number;
	}>;
	itemsTotalCents: number;
	effectiveExpenseCents: number;
	unregisteredExpenseCents: number;
	declaredOverPaymentCents: number;
};
export type FinanceActivityDto =
	| { kind: "transaction"; activityDate: string; transaction: TransactionDto }
	| {
			kind: "invoice_payment";
			activityDate: string;
			payment: InvoicePaymentDto;
			paymentMethod: PaymentMethodDto;
			itemsTotalCents: number;
			unregisteredExpenseCents: number;
			declaredOverPaymentCents: number;
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
	invoicePaymentInput,
	removeInvoicePayment: z.object({
		paymentMethodId: z.string().uuid(),
		referenceMonth,
	}),
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
	listActivity: z.object({
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
function invoicePaymentDto(
	row: typeof creditCardInvoicePayments.$inferSelect,
): InvoicePaymentDto {
	return {
		id: row.id,
		paymentMethodId: row.paymentMethodId,
		referenceMonth: row.referenceMonth,
		paidAt: row.paidAt,
		amountCents: row.amountCents,
		cycleClosingDate: row.cycleClosingDate,
		cycleDueDate: row.cycleDueDate,
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
	const installments = await db
		.select()
		.from(transactionInstallments)
		.where(
			and(
				eq(transactionInstallments.userId, userId),
				eq(transactionInstallments.transactionId, id),
			),
		)
		.orderBy(asc(transactionInstallments.installmentNumber));
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
		installmentPlan: installments.length
			? {
					installmentCount: installments[0].installmentCount,
					firstReferenceMonth: installments[0].referenceMonth,
					installments: installments.map((installment) => ({
						number: installment.installmentNumber,
						amountCents: installment.amountCents,
						referenceMonth: installment.referenceMonth,
					})),
				}
			: null,
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
	function installmentSchedule(
		data: z.infer<typeof transactionInput>,
		method: PaymentRow | null,
	) {
		const installmentCount = data.installmentCount ?? 1;
		const controlledCard =
			data.type === "expense" &&
			method?.kind === "credit_card" &&
			method.invoiceControl &&
			method.closingDay &&
			method.dueDay;
		if (!controlledCard) {
			if (installmentCount !== 1 || data.firstInvoiceReferenceMonth != null)
				throw new FinanceError(
					"VALIDATION_ERROR",
					"Parcelamento só está disponível para despesas em cartão com controle de fatura.",
				);
			return [];
		}
		let amounts: number[];
		try {
			amounts = splitInstallmentAmounts(data.amountCents, installmentCount);
		} catch {
			throw new FinanceError(
				"VALIDATION_ERROR",
				"O valor deve permitir ao menos um centavo por parcela.",
			);
		}
		const automaticReferenceMonth = invoiceCycleFor(
			data.occurredAt,
			method.closingDay!,
			method.dueDay!,
		).dueDate.slice(0, 7);
		const firstReferenceMonth =
			data.firstInvoiceReferenceMonth ?? automaticReferenceMonth;
		return amounts.map((amountCents, index) => ({
			id: crypto.randomUUID(),
			installmentNumber: index + 1,
			installmentCount,
			amountCents,
			referenceMonth: shiftReferenceMonth(firstReferenceMonth, index),
		}));
	}
	async function buildInvoices(id: string): Promise<InvoiceDto[]> {
		const installmentRows = await db
			.select({
				installment: transactionInstallments,
				transaction: transactions,
				category: categories,
				paymentMethod: paymentMethods,
			})
			.from(transactionInstallments)
			.innerJoin(
				transactions,
				and(
					eq(transactionInstallments.transactionId, transactions.id),
					eq(transactionInstallments.userId, transactions.userId),
				),
			)
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
					eq(transactionInstallments.paymentMethodId, paymentMethods.id),
					eq(transactionInstallments.userId, paymentMethods.userId),
				),
			)
			.where(
				and(
					eq(transactionInstallments.userId, id),
					isNull(transactions.archivedAt),
				),
			);
		const paymentRows = await db
			.select({
				payment: creditCardInvoicePayments,
				paymentMethod: paymentMethods,
			})
			.from(creditCardInvoicePayments)
			.innerJoin(
				paymentMethods,
				and(
					eq(creditCardInvoicePayments.paymentMethodId, paymentMethods.id),
					eq(creditCardInvoicePayments.userId, paymentMethods.userId),
				),
			)
			.where(eq(creditCardInvoicePayments.userId, id));
		type InvoiceDraft = {
			paymentMethod: PaymentRow;
			referenceMonth: string;
			payment: typeof creditCardInvoicePayments.$inferSelect | null;
			items: InvoiceDto["items"];
		};
		const grouped = new Map<string, InvoiceDraft>();
		const keyFor = (paymentMethodId: string, month: string) =>
			`${paymentMethodId}|${month}`;
		const categoryById = await categoryMap(db, id);
		for (const row of installmentRows) {
			const key = keyFor(
				row.installment.paymentMethodId,
				row.installment.referenceMonth,
			);
			const draft = grouped.get(key) ?? {
				paymentMethod: row.paymentMethod,
				referenceMonth: row.installment.referenceMonth,
				payment: null,
				items: [],
			};
			draft.items.push({
				transactionId: row.transaction.id,
				occurredAt: row.transaction.occurredAt,
				description: row.transaction.description,
				amountCents: row.installment.amountCents,
				category: categoryById.get(row.category.id)!,
				installmentNumber: row.installment.installmentNumber,
				installmentCount: row.installment.installmentCount,
			});
			grouped.set(key, draft);
		}
		for (const row of paymentRows) {
			const key = keyFor(
				row.payment.paymentMethodId,
				row.payment.referenceMonth,
			);
			const draft = grouped.get(key) ?? {
				paymentMethod: row.paymentMethod,
				referenceMonth: row.payment.referenceMonth,
				payment: null,
				items: [],
			};
			draft.payment = row.payment;
			grouped.set(key, draft);
		}
		const today = saoPauloToday();
		return [...grouped.values()]
			.map((draft) => {
				const payment = draft.payment ? invoicePaymentDto(draft.payment) : null;
				const cycle =
					payment ??
					(draft.paymentMethod.closingDay && draft.paymentMethod.dueDay
						? invoiceCycleForReferenceMonth(
								draft.referenceMonth,
								draft.paymentMethod.closingDay,
								draft.paymentMethod.dueDay,
							)
						: {
								closingDate: `${draft.referenceMonth}-01`,
								dueDate: `${draft.referenceMonth}-01`,
							});
				const cycleClosingDate =
					"cycleClosingDate" in cycle
						? cycle.cycleClosingDate
						: cycle.closingDate;
				const cycleDueDate =
					"cycleDueDate" in cycle ? cycle.cycleDueDate : cycle.dueDate;
				const itemsTotalCents = draft.items.reduce(
					(sum, item) => sum + item.amountCents,
					0,
				);
				const paidAmountCents = payment?.amountCents ?? null;
				const unregisteredExpenseCents =
					paidAmountCents === null
						? 0
						: Math.max(paidAmountCents - itemsTotalCents, 0);
				const declaredOverPaymentCents =
					paidAmountCents === null
						? 0
						: Math.max(itemsTotalCents - paidAmountCents, 0);
				return {
					paymentMethodId: draft.paymentMethod.id,
					paymentMethod: paymentDto(draft.paymentMethod),
					referenceMonth: draft.referenceMonth,
					cycleClosingDate,
					cycleDueDate,
					status: payment
						? ("paid" as const)
						: cycleClosingDate > today
							? ("projected" as const)
							: ("open" as const),
					payment,
					items: draft.items.sort(
						(a, b) =>
							a.occurredAt.localeCompare(b.occurredAt) ||
							a.installmentNumber - b.installmentNumber,
					),
					itemsTotalCents,
					effectiveExpenseCents:
						paidAmountCents === null
							? itemsTotalCents
							: Math.max(itemsTotalCents, paidAmountCents),
					unregisteredExpenseCents,
					declaredOverPaymentCents,
				};
			})
			.sort(
				(a, b) =>
					b.referenceMonth.localeCompare(a.referenceMonth) ||
					a.paymentMethod.name.localeCompare(b.paymentMethod.name),
			);
	}
	async function activityPage(
		id: string,
		cursor: Cursor | undefined,
		limit: number,
	) {
		const transactionAfter = cursor
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
		const paymentAfter = cursor
			? or(
					lt(creditCardInvoicePayments.paidAt, cursor.occurredAt),
					and(
						eq(creditCardInvoicePayments.paidAt, cursor.occurredAt),
						lt(creditCardInvoicePayments.createdAt, cursor.createdAt),
					),
					and(
						eq(creditCardInvoicePayments.paidAt, cursor.occurredAt),
						eq(creditCardInvoicePayments.createdAt, cursor.createdAt),
						lt(creditCardInvoicePayments.id, cursor.id),
					),
				)
			: undefined;
		const [transactionRows, paymentRows, invoices] = await Promise.all([
			db
				.select({
					id: transactions.id,
					activityDate: transactions.occurredAt,
					createdAt: transactions.createdAt,
				})
				.from(transactions)
				.where(
					and(
						eq(transactions.userId, id),
						isNull(transactions.archivedAt),
						transactionAfter,
					),
				)
				.orderBy(
					desc(transactions.occurredAt),
					desc(transactions.createdAt),
					desc(transactions.id),
				)
				.limit(limit + 1),
			db
				.select({
					payment: creditCardInvoicePayments,
					paymentMethod: paymentMethods,
				})
				.from(creditCardInvoicePayments)
				.innerJoin(
					paymentMethods,
					and(
						eq(creditCardInvoicePayments.paymentMethodId, paymentMethods.id),
						eq(creditCardInvoicePayments.userId, paymentMethods.userId),
					),
				)
				.where(and(eq(creditCardInvoicePayments.userId, id), paymentAfter))
				.orderBy(
					desc(creditCardInvoicePayments.paidAt),
					desc(creditCardInvoicePayments.createdAt),
					desc(creditCardInvoicePayments.id),
				)
				.limit(limit + 1),
			buildInvoices(id),
		]);
		const invoiceByKey = new Map(
			invoices.map((invoice) => [
				`${invoice.paymentMethodId}|${invoice.referenceMonth}`,
				invoice,
			]),
		);
		const candidates = [
			...transactionRows.map((row) => ({
				kind: "transaction" as const,
				id: row.id,
				activityDate: row.activityDate,
				createdAt: row.createdAt,
			})),
			...paymentRows.map((row) => ({
				kind: "invoice_payment" as const,
				id: row.payment.id,
				activityDate: row.payment.paidAt,
				createdAt: row.payment.createdAt,
				row,
			})),
		]
			.sort(
				(a, b) =>
					b.activityDate.localeCompare(a.activityDate) ||
					b.createdAt - a.createdAt ||
					b.id.localeCompare(a.id),
			)
			.slice(0, limit + 1);
		const page = candidates.slice(0, limit);
		const items: FinanceActivityDto[] = await Promise.all(
			page.map(async (item) => {
				if (item.kind === "transaction")
					return {
						kind: "transaction" as const,
						activityDate: item.activityDate,
						transaction: await transactionDto(db, id, item.id),
					};
				const invoice = invoiceByKey.get(
					`${item.row.payment.paymentMethodId}|${item.row.payment.referenceMonth}`,
				);
				return {
					kind: "invoice_payment" as const,
					activityDate: item.activityDate,
					payment: invoicePaymentDto(item.row.payment),
					paymentMethod: paymentDto(item.row.paymentMethod),
					itemsTotalCents: invoice?.itemsTotalCents ?? 0,
					unregisteredExpenseCents:
						invoice?.unregisteredExpenseCents ?? item.row.payment.amountCents,
					declaredOverPaymentCents: invoice?.declaredOverPaymentCents ?? 0,
				};
			}),
		);
		const last = page.at(-1);
		return {
			items,
			nextCursor:
				candidates.length > limit && last
					? encodeCursor({
							occurredAt: last.activityDate,
							createdAt: last.createdAt,
							id: last.id,
						})
					: null,
		};
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
			const current = await ownedPaymentMethod(db, id, data.id);
			const configured = data.kind === "credit_card" && data.invoiceControl;
			if (current.invoiceControl && !configured) {
				const [installment, payment] = await Promise.all([
					db
						.select({ id: transactionInstallments.id })
						.from(transactionInstallments)
						.where(
							and(
								eq(transactionInstallments.userId, id),
								eq(transactionInstallments.paymentMethodId, data.id),
							),
						)
						.limit(1),
					db
						.select({ id: creditCardInvoicePayments.id })
						.from(creditCardInvoicePayments)
						.where(
							and(
								eq(creditCardInvoicePayments.userId, id),
								eq(creditCardInvoicePayments.paymentMethodId, data.id),
							),
						)
						.limit(1),
				]);
				if (installment.length || payment.length)
					throw new FinanceError(
						"CONFLICT",
						"Remova ou altere as compras e faturas vinculadas antes de desativar o controle de fatura.",
					);
			}
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
			const schedule = installmentSchedule(data, method);
			const timestamp = now();
			const transactionId = crypto.randomUUID();
			const statements: D1PreparedStatement[] = [
				d1
					.prepare(
						"insert into transactions (id,user_id,category_id,payment_method_id,type,amount_cents,currency,occurred_at,description,archived_at,created_at,updated_at) values (?,?,?,?,?,?,'BRL',?,?,null,?,?)",
					)
					.bind(
						transactionId,
						id,
						data.categoryId,
						paymentMethodId,
						data.type,
						data.amountCents,
						data.occurredAt,
						data.description || null,
						timestamp,
						timestamp,
					),
			];
			for (const installment of schedule)
				statements.push(
					d1
						.prepare(
							"insert into transaction_installments (id,user_id,transaction_id,payment_method_id,installment_number,installment_count,amount_cents,reference_month,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?)",
						)
						.bind(
							installment.id,
							id,
							transactionId,
							paymentMethodId,
							installment.installmentNumber,
							installment.installmentCount,
							installment.amountCents,
							installment.referenceMonth,
							timestamp,
							timestamp,
						),
				);
			await d1.batch(statements);
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
			const schedule = installmentSchedule(data, method);
			const timestamp = now();
			const statements: D1PreparedStatement[] = [
				d1
					.prepare(
						"update transactions set type=?,category_id=?,payment_method_id=?,amount_cents=?,occurred_at=?,description=?,updated_at=? where id=? and user_id=?",
					)
					.bind(
						data.type,
						data.categoryId,
						data.paymentMethodId,
						data.amountCents,
						data.occurredAt,
						data.description || null,
						timestamp,
						data.id,
						id,
					),
				d1
					.prepare(
						"delete from transaction_installments where transaction_id=? and user_id=?",
					)
					.bind(data.id, id),
			];
			for (const installment of schedule)
				statements.push(
					d1
						.prepare(
							"insert into transaction_installments (id,user_id,transaction_id,payment_method_id,installment_number,installment_count,amount_cents,reference_month,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?)",
						)
						.bind(
							installment.id,
							id,
							data.id,
							data.paymentMethodId,
							installment.installmentNumber,
							installment.installmentCount,
							installment.amountCents,
							installment.referenceMonth,
							timestamp,
							timestamp,
						),
				);
			await d1.batch(statements);
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
		async listActivity(data: z.infer<typeof financeSchemas.listActivity>) {
			const id = await userId();
			return activityPage(id, decodeCursor(data.cursor), 30);
		},
		async listInvoices() {
			const id = await userId();
			return buildInvoices(id);
		},
		async saveInvoicePayment(data: z.infer<typeof invoicePaymentInput>) {
			const id = await userId();
			const method = await ownedPaymentMethod(db, id, data.paymentMethodId);
			if (
				method.kind !== "credit_card" ||
				!method.invoiceControl ||
				!method.closingDay ||
				!method.dueDay
			)
				throw new FinanceError(
					"VALIDATION_ERROR",
					"Escolha um cartão com controle de fatura.",
				);
			const existing = (
				await db
					.select()
					.from(creditCardInvoicePayments)
					.where(
						and(
							eq(creditCardInvoicePayments.userId, id),
							eq(
								creditCardInvoicePayments.paymentMethodId,
								data.paymentMethodId,
							),
							eq(creditCardInvoicePayments.referenceMonth, data.referenceMonth),
						),
					)
					.limit(1)
			)[0];
			if (method.archivedAt && !existing) {
				const installment = (
					await db
						.select({ id: transactionInstallments.id })
						.from(transactionInstallments)
						.where(
							and(
								eq(transactionInstallments.userId, id),
								eq(
									transactionInstallments.paymentMethodId,
									data.paymentMethodId,
								),
								eq(transactionInstallments.referenceMonth, data.referenceMonth),
							),
						)
						.limit(1)
				)[0];
				if (!installment)
					throw new FinanceError(
						"CONFLICT",
						"Cartão arquivado só aceita pagamento de uma fatura já existente.",
					);
			}
			const cycle = existing
				? {
						closingDate: existing.cycleClosingDate,
						dueDate: existing.cycleDueDate,
					}
				: invoiceCycleForReferenceMonth(
						data.referenceMonth,
						method.closingDay,
						method.dueDay,
					);
			const timestamp = now();
			const paymentId = existing?.id ?? crypto.randomUUID();
			await d1
				.prepare(
					"insert into credit_card_invoice_payments (id,user_id,payment_method_id,reference_month,cycle_closing_date,cycle_due_date,paid_at,amount_cents,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?) on conflict(user_id,payment_method_id,reference_month) do update set paid_at=excluded.paid_at,amount_cents=excluded.amount_cents,updated_at=excluded.updated_at",
				)
				.bind(
					paymentId,
					id,
					data.paymentMethodId,
					data.referenceMonth,
					cycle.closingDate,
					cycle.dueDate,
					data.paidAt,
					data.amountCents,
					existing?.createdAt ?? timestamp,
					timestamp,
				)
				.run();
			const invoice = (await buildInvoices(id)).find(
				(item) =>
					item.paymentMethodId === data.paymentMethodId &&
					item.referenceMonth === data.referenceMonth,
			);
			if (!invoice)
				throw new FinanceError("NOT_FOUND", "Fatura não encontrada.");
			return invoice;
		},
		async removeInvoicePayment(
			data: z.infer<typeof financeSchemas.removeInvoicePayment>,
		) {
			const id = await userId();
			const deleted = await db
				.delete(creditCardInvoicePayments)
				.where(
					and(
						eq(creditCardInvoicePayments.userId, id),
						eq(creditCardInvoicePayments.paymentMethodId, data.paymentMethodId),
						eq(creditCardInvoicePayments.referenceMonth, data.referenceMonth),
					),
				)
				.returning({ id: creditCardInvoicePayments.id });
			if (!deleted[0])
				throw new FinanceError("NOT_FOUND", "Pagamento não encontrado.");
			return { id: deleted[0].id };
		},
		async getDashboard() {
			const id = await userId();
			await bootstrap(db, d1, id);
			const { startDate, endDate } = periodFor("month", saoPauloToday());
			const [rows, invoices] = await Promise.all([
				db
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
					),
				buildInvoices(id),
			]);
			const scheduledTransactionIds = new Set(
				invoices.flatMap((invoice) =>
					invoice.items.map((item) => item.transactionId),
				),
			);
			const incomeCents = rows
				.filter((row) => row.transaction.type === "income")
				.reduce((sum, row) => sum + row.transaction.amountCents, 0);
			const regularExpenseCents = rows
				.filter(
					(row) =>
						row.transaction.type === "expense" &&
						!scheduledTransactionIds.has(row.transaction.id),
				)
				.reduce((sum, row) => sum + row.transaction.amountCents, 0);
			const invoiceExpenseCents = invoices
				.filter(
					(invoice) =>
						invoice.cycleDueDate >= startDate && invoice.cycleDueDate < endDate,
				)
				.reduce((sum, invoice) => sum + invoice.effectiveExpenseCents, 0);
			const expenseCents = regularExpenseCents + invoiceExpenseCents;
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
			const recentActivity = await activityPage(id, undefined, 5);
			return {
				month: {
					incomeCents,
					expenseCents,
					balanceCents: incomeCents - expenseCents,
				},
				incomeByPaymentMethod: [...byPayment.values()].sort(
					(a, b) => b.amountCents - a.amountCents,
				),
				recentActivity: recentActivity.items,
			};
		},
		async getReport(data: z.infer<typeof financeSchemas.report>) {
			const id = await userId();
			const period = periodFor(data.granularity, data.anchorDate);
			const [rows, invoices] = await Promise.all([
				db
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
					),
				buildInvoices(id),
			]);
			const scheduledTransactionIds = new Set(
				invoices.flatMap((invoice) =>
					invoice.items.map((item) => item.transactionId),
				),
			);
			const incomeCents = rows
				.filter((row) => row.transaction.type === "income")
				.reduce((sum, row) => sum + row.transaction.amountCents, 0);
			const expenseRows = rows.filter(
				(row) =>
					row.transaction.type === "expense" &&
					!scheduledTransactionIds.has(row.transaction.id),
			);
			const periodInvoices = invoices.filter(
				(invoice) =>
					invoice.cycleDueDate >= period.startDate &&
					invoice.cycleDueDate < period.endDate,
			);
			const unregisteredExpenseCents = periodInvoices.reduce(
				(sum, invoice) => sum + invoice.unregisteredExpenseCents,
				0,
			);
			const map = await categoryMap(db, id);
			const direct = new Map<string, number>();
			for (const row of expenseRows)
				direct.set(
					row.category.id,
					(direct.get(row.category.id) ?? 0) + row.transaction.amountCents,
				);
			for (const invoice of periodInvoices)
				for (const item of invoice.items)
					direct.set(
						item.category.id,
						(direct.get(item.category.id) ?? 0) + item.amountCents,
					);
			const categorizedExpenseCents = [...direct.values()].reduce(
				(sum, amount) => sum + amount,
				0,
			);
			const expenseCents = categorizedExpenseCents + unregisteredExpenseCents;
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
				unregisteredExpenseCents,
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
