import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { FinanceError, createFinanceService } from "#/server/finance-service";
import { createAuthedPair, headersWithCookie } from "./fixtures";

function serviceFor(cookieHeader: string) {
	return createFinanceService({ d1: env.DB, headers: headersWithCookie(cookieHeader) });
}

describe("payment methods and category hierarchy", () => {
	it("accepts animal icons for categories and payment methods", async () => {
		const { a } = await createAuthedPair();
		const service = serviceFor(a.cookieHeader);
		const suffix = crypto.randomUUID().slice(0, 8);

		const category = await service.createCategory({
			type: "expense",
			name: `Pets ${suffix}`,
			colorKey: "orange",
			iconKey: "CatSitting",
		});
		const paymentMethod = await service.createPaymentMethod({
			name: `Pet card ${suffix}`,
			kind: "other",
			colorKey: "orange",
			iconKey: "Fish",
			invoiceControl: false,
		});

		expect(category.iconKey).toBe("CatSitting");
		expect(paymentMethod.iconKey).toBe("Fish");
	});

	it("seeds the four standard payment methods once per user", async () => {
		const { a } = await createAuthedPair();
		const service = serviceFor(a.cookieHeader);

		const methods = await service.listPaymentMethods({ status: "active" });
		expect(methods.map((method) => [method.name, method.kind])).toEqual([
			["Crédito", "credit_card"],
			["Dinheiro", "cash"],
			["Débito", "debit_card"],
			["Pix", "pix"],
		]);

		const cash = methods.find((method) => method.kind === "cash")!;
		await service.archivePaymentMethod({ id: cash.id });
		const allMethods = await service.listPaymentMethods({ status: "all" });
		expect(allMethods).toHaveLength(4);
		expect(allMethods.find((method) => method.id === cash.id)?.archivedAt).not.toBe(
			null,
		);
	});

	it("limits categories to three levels and keeps an archived payment method only for historical retention", async () => {
		const { a } = await createAuthedPair();
		const service = serviceFor(a.cookieHeader);
		const suffix = crypto.randomUUID().slice(0, 8);
		const root = await service.createCategory({ type: "expense", name: `Root ${suffix}`, colorKey: "orange", iconKey: "Utensils" });
		const child = await service.createCategory({ type: "expense", name: `Child ${suffix}`, colorKey: "orange", iconKey: "Utensils", parentCategoryId: root.id });
		const grandchild = await service.createCategory({ type: "expense", name: `Grand ${suffix}`, colorKey: "orange", iconKey: "Utensils", parentCategoryId: child.id });
		expect(grandchild).toMatchObject({ level: 3, path: [root.id, child.id, grandchild.id] });
		await expect(service.createCategory({ type: "expense", name: `Deep ${suffix}`, colorKey: "orange", iconKey: "Utensils", parentCategoryId: grandchild.id })).rejects.toBeInstanceOf(FinanceError);

		const card = await service.createPaymentMethod({ name: `Card ${suffix}`, kind: "credit_card", colorKey: "indigo", iconKey: "CreditCard", invoiceControl: true, closingDay: 10, dueDay: 20 });
		expect(card).toMatchObject({ colorKey: "indigo", iconKey: "CreditCard" });
		const transaction = await service.createTransaction({ type: "expense", categoryId: grandchild.id, paymentMethodId: card.id, amountCents: 2500, occurredAt: "2024-02-10", description: "invoice item" });
		expect(transaction).toMatchObject({ paymentMethodId: card.id, installmentPlan: { installmentCount: 1, firstReferenceMonth: "2024-02" } });
		await service.archivePaymentMethod({ id: card.id });
		await expect(service.createTransaction({ type: "expense", categoryId: grandchild.id, paymentMethodId: card.id, amountCents: 1, occurredAt: "2024-02-11" })).rejects.toMatchObject({ code: "CONFLICT" });
		const retained = await service.updateTransaction({ id: transaction.id, type: "expense", categoryId: grandchild.id, paymentMethodId: card.id, amountCents: 2600, occurredAt: "2024-02-11", description: "retained" });
		expect(retained.installmentPlan?.firstReferenceMonth).toBe("2024-03");
		const invoices = await service.listInvoices();
		expect(invoices).toEqual([expect.objectContaining({ paymentMethodId: card.id, itemsTotalCents: 2600, effectiveExpenseCents: 2600, cycleClosingDate: "2024-03-10", cycleDueDate: "2024-03-20" })]);
	});

	it("splits purchases across projected invoices and reconciles one payment without duplicating expenses", async () => {
		const { a } = await createAuthedPair();
		const service = serviceFor(a.cookieHeader);
		const suffix = crypto.randomUUID().slice(0, 8);
		const category = await service.createCategory({ type: "expense", name: `Installments ${suffix}`, colorKey: "orange", iconKey: "ShoppingBag" });
		const card = await service.createPaymentMethod({ name: `Invoice card ${suffix}`, kind: "credit_card", colorKey: "indigo", iconKey: "CreditCard", invoiceControl: true, closingDay: 25, dueDay: 5 });
		const purchase = await service.createTransaction({
			type: "expense",
			categoryId: category.id,
			paymentMethodId: card.id,
			amountCents: 1000,
			occurredAt: "2024-06-20",
			description: "three parts",
			installmentCount: 3,
			firstInvoiceReferenceMonth: "2024-07",
		});
		expect(purchase.installmentPlan?.installments).toEqual([
			{ number: 1, amountCents: 333, referenceMonth: "2024-07" },
			{ number: 2, amountCents: 333, referenceMonth: "2024-08" },
			{ number: 3, amountCents: 334, referenceMonth: "2024-09" },
		]);
		let invoices = await service.listInvoices();
		expect(invoices.map((invoice) => [invoice.referenceMonth, invoice.itemsTotalCents])).toEqual([
			["2024-09", 334],
			["2024-08", 333],
			["2024-07", 333],
		]);

		await service.saveInvoicePayment({
			paymentMethodId: card.id,
			referenceMonth: "2024-07",
			paidAt: "2024-07-05",
			amountCents: 500,
		});
		invoices = await service.listInvoices();
		expect(invoices.find((invoice) => invoice.referenceMonth === "2024-07")).toMatchObject({
			status: "paid",
			itemsTotalCents: 333,
			effectiveExpenseCents: 500,
			unregisteredExpenseCents: 167,
			declaredOverPaymentCents: 0,
		});
		const july = await service.getReport({ granularity: "month", anchorDate: "2024-07-10" });
		expect(july).toMatchObject({ expenseCents: 500, unregisteredExpenseCents: 167 });
		const activity = await service.listActivity({});
		expect(activity.items.some((item) => item.kind === "invoice_payment")).toBe(true);

		await service.updateTransaction({
			id: purchase.id,
			type: "expense",
			categoryId: category.id,
			paymentMethodId: card.id,
			amountCents: 1800,
			occurredAt: "2024-06-20",
			description: "corrected",
			installmentCount: 3,
			firstInvoiceReferenceMonth: "2024-07",
		});
		const corrected = (await service.listInvoices()).find((invoice) => invoice.referenceMonth === "2024-07");
		expect(corrected).toMatchObject({
			itemsTotalCents: 600,
			effectiveExpenseCents: 600,
			unregisteredExpenseCents: 0,
			declaredOverPaymentCents: 100,
		});
	});

	it("upserts, removes and isolates invoice payments while archived purchases keep reconciling", async () => {
		const { a, b } = await createAuthedPair();
		const service = serviceFor(a.cookieHeader);
		const otherService = serviceFor(b.cookieHeader);
		const suffix = crypto.randomUUID().slice(0, 8);
		const category = await service.createCategory({
			type: "expense",
			name: `Reconciliation ${suffix}`,
			colorKey: "orange",
			iconKey: "ReceiptText",
		});
		const card = await service.createPaymentMethod({
			name: `Reconciliation card ${suffix}`,
			kind: "credit_card",
			colorKey: "indigo",
			iconKey: "CreditCard",
			invoiceControl: true,
			closingDay: 20,
			dueDay: 28,
		});
		const purchase = await service.createTransaction({
			type: "expense",
			categoryId: category.id,
			paymentMethodId: card.id,
			amountCents: 1000,
			occurredAt: "2024-09-10",
			firstInvoiceReferenceMonth: "2024-10",
		});

		await service.saveInvoicePayment({
			paymentMethodId: card.id,
			referenceMonth: "2024-10",
			paidAt: "2024-10-28",
			amountCents: 1000,
		});
		expect(
			(await service.listInvoices()).find(
				(invoice) => invoice.referenceMonth === "2024-10",
			),
		).toMatchObject({
			itemsTotalCents: 1000,
			effectiveExpenseCents: 1000,
			unregisteredExpenseCents: 0,
			declaredOverPaymentCents: 0,
		});

		await service.saveInvoicePayment({
			paymentMethodId: card.id,
			referenceMonth: "2024-10",
			paidAt: "2024-10-29",
			amountCents: 900,
		});
		const paymentCount = await env.DB.prepare(
			"select count(*) as count from credit_card_invoice_payments where user_id = ? and payment_method_id = ? and reference_month = ?",
		)
			.bind(a.id, card.id, "2024-10")
			.first<{ count: number }>();
		expect(paymentCount?.count).toBe(1);
		expect(
			(await service.listInvoices()).find(
				(invoice) => invoice.referenceMonth === "2024-10",
			),
		).toMatchObject({
			itemsTotalCents: 1000,
			effectiveExpenseCents: 1000,
			unregisteredExpenseCents: 0,
			declaredOverPaymentCents: 100,
			payment: { amountCents: 900, paidAt: "2024-10-29" },
		});

		await service.archiveTransaction({ id: purchase.id });
		expect(
			(await service.listInvoices()).find(
				(invoice) => invoice.referenceMonth === "2024-10",
			),
		).toMatchObject({
			itemsTotalCents: 0,
			effectiveExpenseCents: 900,
			unregisteredExpenseCents: 900,
		});
		await service.restoreTransaction({ id: purchase.id });

		await service.saveInvoicePayment({
			paymentMethodId: card.id,
			referenceMonth: "2024-11",
			paidAt: "2024-11-28",
			amountCents: 700,
		});
		expect(
			(await service.listInvoices()).find(
				(invoice) => invoice.referenceMonth === "2024-11",
			),
		).toMatchObject({
			itemsTotalCents: 0,
			effectiveExpenseCents: 700,
			unregisteredExpenseCents: 700,
		});

		await expect(
			otherService.saveInvoicePayment({
				paymentMethodId: card.id,
				referenceMonth: "2024-10",
				paidAt: "2024-10-28",
				amountCents: 1,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });

		await service.archivePaymentMethod({ id: card.id });
		await service.saveInvoicePayment({
			paymentMethodId: card.id,
			referenceMonth: "2024-10",
			paidAt: "2024-10-30",
			amountCents: 950,
		});
		await expect(
			service.saveInvoicePayment({
				paymentMethodId: card.id,
				referenceMonth: "2024-12",
				paidAt: "2024-12-28",
				amountCents: 500,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });

		await service.removeInvoicePayment({
			paymentMethodId: card.id,
			referenceMonth: "2024-10",
		});
		expect(
			(await service.listInvoices()).find(
				(invoice) => invoice.referenceMonth === "2024-10",
			),
		).toMatchObject({
			payment: null,
			itemsTotalCents: 1000,
			effectiveExpenseCents: 1000,
			unregisteredExpenseCents: 0,
		});
	});

	it("rejects moves and restores that would make archived descendants exceed level three", async () => {
		const { a } = await createAuthedPair();
		const service = serviceFor(a.cookieHeader);
		const suffix = crypto.randomUUID().slice(0, 8);
		const root = await service.createCategory({ type: "expense", name: `Root ${suffix}`, colorKey: "orange", iconKey: "Utensils" });
		const moving = await service.createCategory({ type: "expense", name: `Moving ${suffix}`, colorKey: "orange", iconKey: "Utensils", parentCategoryId: root.id });
		const archivedGrandchild = await service.createCategory({ type: "expense", name: `Grand ${suffix}`, colorKey: "orange", iconKey: "Utensils", parentCategoryId: moving.id });
		const targetRoot = await service.createCategory({ type: "expense", name: `Target ${suffix}`, colorKey: "orange", iconKey: "Utensils" });
		const targetChild = await service.createCategory({ type: "expense", name: `Target child ${suffix}`, colorKey: "orange", iconKey: "Utensils", parentCategoryId: targetRoot.id });
		await service.archiveCategory({ id: archivedGrandchild.id });
		await service.archiveCategory({ id: moving.id });
		await expect(service.updateCategory({ id: moving.id, name: moving.name, colorKey: moving.colorKey as "orange", iconKey: moving.iconKey as "Utensils", parentCategoryId: targetChild.id })).rejects.toMatchObject({ code: "CONFLICT" });

		const fourthId = crypto.randomUUID();
		await env.DB.prepare("insert into categories (id,user_id,type,name,normalized_name,color_key,icon_key,parent_category_id,archived_at,created_at,updated_at) values (?, ?, 'expense', ?, ?, 'orange', 'Utensils', ?, ?, ?, ?)").bind(fourthId, a.id, `Fourth ${suffix}`, `fourth ${suffix}`, archivedGrandchild.id, Date.now(), Date.now(), Date.now()).run();
		await service.archiveCategory({ id: archivedGrandchild.id });
		await expect(service.restoreCategory({ id: moving.id })).rejects.toMatchObject({ code: "CONFLICT" });
	});
});
