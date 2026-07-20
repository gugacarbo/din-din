import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { FinanceError, createFinanceService } from "#/server/finance-service";
import { createAuthedPair, headersWithCookie } from "./fixtures";

function serviceFor(cookieHeader: string) {
	return createFinanceService({ d1: env.DB, headers: headersWithCookie(cookieHeader) });
}

describe("payment methods and category hierarchy", () => {
	it("limits categories to three levels and keeps an archived payment method only for historical retention", async () => {
		const { a } = await createAuthedPair();
		const service = serviceFor(a.cookieHeader);
		const suffix = crypto.randomUUID().slice(0, 8);
		const root = await service.createCategory({ type: "expense", name: `Root ${suffix}`, colorKey: "orange", iconKey: "Utensils" });
		const child = await service.createCategory({ type: "expense", name: `Child ${suffix}`, colorKey: "orange", iconKey: "Utensils", parentCategoryId: root.id });
		const grandchild = await service.createCategory({ type: "expense", name: `Grand ${suffix}`, colorKey: "orange", iconKey: "Utensils", parentCategoryId: child.id });
		expect(grandchild).toMatchObject({ level: 3, path: [root.id, child.id, grandchild.id] });
		await expect(service.createCategory({ type: "expense", name: `Deep ${suffix}`, colorKey: "orange", iconKey: "Utensils", parentCategoryId: grandchild.id })).rejects.toBeInstanceOf(FinanceError);

		const card = await service.createPaymentMethod({ name: `Card ${suffix}`, kind: "credit_card", invoiceControl: true, closingDay: 10, dueDay: 20 });
		const transaction = await service.createTransaction({ type: "expense", categoryId: grandchild.id, paymentMethodId: card.id, amountCents: 2500, occurredAt: "2024-02-10", description: "invoice item" });
		expect(transaction).toMatchObject({ paymentMethodId: card.id, invoiceCycleClosingDate: "2024-02-10", invoiceCycleDueDate: "2024-02-20" });
		await service.archivePaymentMethod({ id: card.id });
		await expect(service.createTransaction({ type: "expense", categoryId: grandchild.id, paymentMethodId: card.id, amountCents: 1, occurredAt: "2024-02-11" })).rejects.toMatchObject({ code: "CONFLICT" });
		const retained = await service.updateTransaction({ id: transaction.id, type: "expense", categoryId: grandchild.id, paymentMethodId: card.id, amountCents: 2600, occurredAt: "2024-02-11", description: "retained" });
		expect(retained.invoiceCycleClosingDate).toBe("2024-03-10");
		const invoices = await service.listInvoices();
		expect(invoices).toEqual([expect.objectContaining({ paymentMethodId: card.id, totalCents: 2600, cycleClosingDate: "2024-03-10", cycleDueDate: "2024-03-20" })]);
	});
});
