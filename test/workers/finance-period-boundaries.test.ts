import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFinanceService } from "#/server/finance-service";
import { createAuthedPair, headersWithCookie, type AuthedUser } from "./fixtures";

type Dashboard = Awaited<ReturnType<ReturnType<typeof createFinanceService>["getDashboard"]>>;
type Report = Awaited<ReturnType<ReturnType<typeof createFinanceService>["getReport"]>>;

function fetchAs(user: AuthedUser, path: string, init?: RequestInit) {
	const headers = new Headers(init?.headers);
	headers.set("cookie", user.cookieHeader);
	return SELF.fetch(`https://test.invalid${path}`, { ...init, headers });
}

async function seed(user: AuthedUser, date: string, prefix: string) {
	const service = createFinanceService({
		d1: env.DB,
		headers: headersWithCookie(user.cookieHeader),
	});
	const income = await service.createCategory({
		type: "income",
		name: `${prefix} income`,
		colorKey: "emerald",
		iconKey: "BriefcaseBusiness",
	});
	const expense = await service.createCategory({
		type: "expense",
		name: `${prefix} expense`,
		colorKey: "orange",
		iconKey: "Utensils",
	});
	return { income, expense, service, date };
}

async function create(
	service: ReturnType<typeof createFinanceService>,
	data: Parameters<ReturnType<typeof createFinanceService>["createTransaction"]>[0],
) {
	return service.createTransaction(data);
}

describe("finance periods through the test-only HTTP Worker", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-02-10T15:00:00.000Z"));
	});
	afterEach(() => vi.useRealTimers());

	it("keeps dashboard aggregates bounded while recent transactions stay global and limited", async () => {
		const { a, b } = await createAuthedPair();
		const aData = await seed(a, "2024-02-10", "dashboard-a");
		const bData = await seed(b, "2024-02-10", "dashboard-b");
		await create(aData.service, { type: "income", categoryId: aData.income.id, amountCents: 10000, occurredAt: "2024-02-01", description: "a-income" });
		for (const [amountCents, description] of [[4000, "a-expense"], [1000, "a-extra-1"], [2000, "a-extra-2"], [3000, "a-extra-3"]] as const)
			await create(aData.service, { type: "expense", categoryId: aData.expense.id, amountCents, occurredAt: "2024-02-29", description });
		await create(aData.service, { type: "expense", categoryId: aData.expense.id, amountCents: 99900, occurredAt: "2024-03-01", description: "a-boundary" });
		const archived = await create(aData.service, { type: "expense", categoryId: aData.expense.id, amountCents: 50000, occurredAt: "2024-02-15", description: "a-archived" });
		await aData.service.archiveTransaction({ id: archived.id });
		await create(bData.service, { type: "expense", categoryId: bData.expense.id, amountCents: 80000, occurredAt: "2024-02-15", description: "b-internal" });

		const response = await fetchAs(
			a,
			"/__test/finance/dashboard?startDate=2024-02-10&endDate=2024-03-01",
		);
		expect(response.status).toBe(200);
		const result = (await response.json()) as Dashboard;
		expect(result).toMatchObject({
			period: { startDate: "2024-02-10", endDate: "2024-03-01" },
			month: { incomeCents: 0, expenseCents: 10000, balanceCents: -10000 },
			incomeByPaymentMethod: [],
		});
		expect(result.recentActivity).toHaveLength(5);
		const recentTransactions = result.recentActivity
			.filter((item) => item.kind === "transaction")
			.map((item) => item.transaction);
		expect(recentTransactions.map((item) => item.description)).toContain("a-boundary");
		expect(recentTransactions.every((item) => item.description?.startsWith("a-") && item.description !== "a-archived")).toBe(true);
	});

	it("recognizes controlled card purchases only when their installments are due", async () => {
		const { a } = await createAuthedPair();
		const data = await seed(a, "2024-02-10", "controlled-card");
		const card = await data.service.createPaymentMethod({
			name: "Future invoice card",
			kind: "credit_card",
			colorKey: "indigo",
			iconKey: "CreditCard",
			invoiceControl: true,
			closingDay: 20,
			dueDay: 28,
		});
		await create(data.service, {
			type: "expense",
			categoryId: data.expense.id,
			amountCents: 1000,
			occurredAt: "2024-02-10",
			description: "future installments",
			paymentMethodId: card.id,
			installmentCount: 2,
			firstInvoiceReferenceMonth: "2024-03",
		});
		await create(data.service, {
			type: "expense",
			categoryId: data.expense.id,
			amountCents: 400,
			occurredAt: "2024-02-11",
			description: "regular expense",
		});

		const dashboard = await data.service.getDashboard({
			startDate: "2024-02-01",
			endDate: "2024-03-01",
		});
		const report = await data.service.getReport({
			granularity: "month",
			anchorDate: "2024-02-10",
		});

		expect(dashboard.month.expenseCents).toBe(400);
		expect(report).toMatchObject({
			expenseCents: 400,
			unregisteredExpenseCents: 0,
		});

		const dueDayResponse = await fetchAs(
			a,
			"/__test/finance/dashboard?startDate=2024-03-28&endDate=2024-03-29",
		);
		expect(dueDayResponse.status).toBe(200);
		expect(await dueDayResponse.json()).toMatchObject({
			period: { startDate: "2024-03-28", endDate: "2024-03-29" },
			month: { incomeCents: 0, expenseCents: 500, balanceCents: -500 },
		});

		const exclusiveEndResponse = await fetchAs(
			a,
			"/__test/finance/dashboard?startDate=2024-03-27&endDate=2024-03-28",
		);
		expect(exclusiveEndResponse.status).toBe(200);
		expect(await exclusiveEndResponse.json()).toMatchObject({
			month: { incomeCents: 0, expenseCents: 0, balanceCents: 0 },
		});
	});

	it.each([
		"/__test/finance/dashboard",
		"/__test/finance/dashboard?startDate=2024-02-01",
		"/__test/finance/dashboard?startDate=2024-02-30&endDate=2024-03-01",
		"/__test/finance/dashboard?startDate=2024-03-01&endDate=2024-03-01",
		"/__test/finance/dashboard?startDate=2024-03-02&endDate=2024-03-01",
	])("rejects an invalid dashboard period without changing data: %s", async (path) => {
		const { a } = await createAuthedPair();
		const before = await env.DB.prepare("select count(*) as count from transactions").first<{ count: number }>();
		expect((await fetchAs(a, path)).status).toBe(400);
		expect(await env.DB.prepare("select count(*) as count from transactions").first<{ count: number }>().then((row) => row?.count)).toBe(before?.count);
	});

	for (const scenario of [
		{ name: "day", anchorDate: "2024-02-29", start: "2024-02-29", end: "2024-03-01" },
		{ name: "week", anchorDate: "2024-02-29", start: "2024-02-26", end: "2024-03-04" },
		{ name: "month", anchorDate: "2024-02-10", start: "2024-02-01", end: "2024-03-01" },
	] as const) {
		it(`excludes the exclusive end date, archived A, and B from the ${scenario.name} report`, async () => {
			const { a, b } = await createAuthedPair();
			const aData = await seed(a, scenario.start, `${scenario.name}-a`);
			const bData = await seed(b, scenario.start, `${scenario.name}-b`);
			await create(aData.service, { type: "income", categoryId: aData.income.id, amountCents: 10000, occurredAt: scenario.start, description: "a-income" });
			await create(aData.service, { type: "expense", categoryId: aData.expense.id, amountCents: 4000, occurredAt: scenario.start, description: "a-expense" });
			await create(aData.service, { type: "expense", categoryId: aData.expense.id, amountCents: 99900, occurredAt: scenario.end, description: "a-boundary" });
			const archived = await create(aData.service, { type: "expense", categoryId: aData.expense.id, amountCents: 50000, occurredAt: scenario.start, description: "a-archived" });
			await aData.service.archiveTransaction({ id: archived.id });
			await create(bData.service, { type: "expense", categoryId: bData.expense.id, amountCents: 80000, occurredAt: scenario.start, description: "b-internal" });

			const response = await fetchAs(a, `/__test/finance/report?granularity=${scenario.name}&anchorDate=${scenario.anchorDate}`);
			expect(response.status).toBe(200);
			const result = (await response.json()) as Report;
			expect(result.period).toMatchObject({ granularity: scenario.name, startDate: scenario.start, endDate: scenario.end });
			expect(result).toMatchObject({ incomeCents: 10000, expenseCents: 4000, balanceCents: 6000 });
			expect(result.expenseByCategory).toEqual([expect.objectContaining({ categoryName: `${scenario.name}-a expense`, amountCents: 4000 })]);
		});
	}

	it("rejects forged identity parameters and preserves cookie A as the only identity source", async () => {
		const { a, b } = await createAuthedPair();
		const aData = await seed(a, "2024-02-10", "identity-a");
		await create(aData.service, { type: "income", categoryId: aData.income.id, amountCents: 10000, occurredAt: "2024-02-10", description: "a-only" });
		const before = await env.DB.prepare("select count(*) as count from transactions").first<{ count: number }>();
		expect((await fetchAs(a, `/__test/finance/dashboard?startDate=2024-02-01&endDate=2024-03-01&userId=${b.id}`)).status).toBe(400);
		expect((await fetchAs(a, `/__test/finance/report?granularity=month&anchorDate=2024-02-10&userId=${b.id}`)).status).toBe(400);
		expect((await fetchAs(a, "/__test/finance/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: b.id }) })).status).toBe(405);
		expect(await env.DB.prepare("select count(*) as count from transactions").first<{ count: number }>().then((row) => row?.count)).toBe(before?.count);
		expect((await fetchAs(a, "/__test/finance/dashboard?startDate=2024-02-01&endDate=2024-03-01")).status).toBe(200);
		expect((await fetchAs(a, "/__test/finance/report?granularity=month&anchorDate=2024-02-10")).status).toBe(200);
		expect((await SELF.fetch("https://test.invalid/__test/finance/dashboard?startDate=2024-02-01&endDate=2024-03-01")).status).toBe(401);
	});
});
