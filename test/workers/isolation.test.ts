import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createFinanceService } from "#/server/finance-service";
import { createAuthedPair, headersWithCookie } from "./fixtures";

/**
 * Testes de isolamento de dados entre usuários no runtime Worker/D1.
 *
 * Cada teste cria dois usuários autenticados (A e B) via Better Auth no D1
 * efêmero e exercita o `createFinanceService` com cookies reais. Nenhum
 * `userId` é passado diretamente — o serviço resolve a sessão internamente,
 * exatamente como em produção.
 *
 * O objetivo é provar que:
 * - A consegue criar e manipular seus próprios dados
 * - B NÃO consegue ler, editar, arquivar, restaurar ou incluir nos relatórios
 *   os dados de A
 * - Os dados de A permanecem inalterados após as tentativas de B
 */

describe("isolamento de dados entre usuários", () => {
	async function expectNotFound(operation: Promise<unknown>) {
		await expect(operation).rejects.toMatchObject({ code: "NOT_FOUND" });
	}

	async function setup() {
		const { a, b } = await createAuthedPair();
		const serviceA = createFinanceService({
			d1: env.DB,
			headers: headersWithCookie(a.cookieHeader),
		});
		const serviceB = createFinanceService({
			d1: env.DB,
			headers: headersWithCookie(b.cookieHeader),
		});
		return { a, b, serviceA, serviceB };
	}

	it("usuário A cria categoria e transação com sucesso", async () => {
		const { serviceA } = await setup();

		const category = await serviceA.createCategory({
			type: "expense",
			name: "Moradia do A",
			colorKey: "blue",
			iconKey: "House",
		});
		expect(category.id).toBeDefined();
		expect(category.name).toBe("Moradia do A");

		const transaction = await serviceA.createTransaction({
			type: "expense",
			categoryId: category.id,
			amountCents: 150000,
			occurredAt: "2026-07-15",
			description: "Aluguel",
		});
		expect(transaction.id).toBeDefined();
		expect(transaction.amountCents).toBe(150000);
	});

	it("B não consegue listar categorias de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "expense",
			name: "Categoria exclusiva do A",
			colorKey: "rose",
			iconKey: "Car",
		});

		const listB = await serviceB.listCategories({ status: "active" });
		const idsB = new Set(listB.map((c) => c.id));
		expect(idsB.has(catA.id)).toBe(false);
	});

	it("B não consegue ler transação de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "expense",
			name: "Categoria do A",
			colorKey: "orange",
			iconKey: "Utensils",
		});
		const txnA = await serviceA.createTransaction({
			type: "expense",
			categoryId: catA.id,
			amountCents: 5000,
			occurredAt: "2026-07-10",
			description: "Compra do A",
		});

		// B tenta listar transações — não deve ver a de A
		const listB = await serviceB.listTransactions({ scope: "active" });
		const idsB = new Set(listB.items.map((t) => t.id));
		expect(idsB.has(txnA.id)).toBe(false);
	});

	it("B não consegue editar categoria de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "expense",
			name: "Categoria original do A",
			colorKey: "teal",
			iconKey: "Tags",
		});

		// B tenta editar a categoria de A — deve falhar com NOT_FOUND
		await expectNotFound(
			serviceB.updateCategory({
				id: catA.id,
				name: "Categoria adulterada por B",
				colorKey: "rose",
				iconKey: "HeartPulse",
			}),
		);

		// Confirma que a categoria de A permanece inalterada
		const listA = await serviceA.listCategories({ status: "active" });
		const catAReloaded = listA.find((c) => c.id === catA.id);
		expect(catAReloaded?.name).toBe("Categoria original do A");
		const persisted = await env.DB
			.prepare("select name from categories where id = ?")
			.bind(catA.id)
			.first<{ name: string }>();
		expect(persisted?.name).toBe("Categoria original do A");
	});

	it("B não consegue editar transação de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "expense",
			name: "Categoria do A",
			colorKey: "amber",
			iconKey: "Car",
		});
		const txnA = await serviceA.createTransaction({
			type: "expense",
			categoryId: catA.id,
			amountCents: 20000,
			occurredAt: "2026-07-12",
			description: "Gasolina",
		});

		// B tenta editar a transação de A — deve falhar com NOT_FOUND
		await expectNotFound(
			serviceB.updateTransaction({
				id: txnA.id,
				type: "expense",
				categoryId: catA.id,
				amountCents: 99999,
				occurredAt: "2026-07-12",
				description: "Adulterado por B",
			}),
		);

		// Confirma que a transação de A permanece inalterada
		const listA = await serviceA.listTransactions({ scope: "active" });
		const txnAReloaded = listA.items.find((t) => t.id === txnA.id);
		expect(txnAReloaded?.amountCents).toBe(20000);
		expect(txnAReloaded?.description).toBe("Gasolina");
		const persisted = await env.DB
			.prepare(
				"select amount_cents as amountCents, description from transactions where id = ?",
			)
			.bind(txnA.id)
			.first<{ amountCents: number; description: string }>();
		expect(persisted).toMatchObject({
			amountCents: 20000,
			description: "Gasolina",
		});
	});

	it("B não cria lançamento usando a categoria de A", async () => {
		const { b, serviceA, serviceB } = await setup();
		const catA = await serviceA.createCategory({
			type: "expense",
			name: "Categoria protegida do A",
			colorKey: "blue",
			iconKey: "House",
		});

		await expectNotFound(
			serviceB.createTransaction({
				type: "expense",
				categoryId: catA.id,
				amountCents: 5000,
				occurredAt: "2026-07-12",
				description: "Tentativa de B",
			}),
		);

		const persisted = await env.DB
			.prepare("select count(*) as count from transactions where user_id = ?")
			.bind(b.id)
			.first<{ count: number }>();
		expect(persisted?.count).toBe(0);
	});

	it("B não consegue arquivar categoria de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "income",
			name: "Renda do A",
			colorKey: "emerald",
			iconKey: "BriefcaseBusiness",
		});

		// B tenta arquivar a categoria de A — deve falhar com NOT_FOUND
		await expectNotFound(serviceB.archiveCategory({ id: catA.id }));

		// Confirma que a categoria de A continua ativa
		const listA = await serviceA.listCategories({ status: "active" });
		expect(listA.some((c) => c.id === catA.id)).toBe(true);
	});

	it("B não consegue arquivar transação de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "expense",
			name: "Despesa do A",
			colorKey: "violet",
			iconKey: "Gamepad2",
		});
		const txnA = await serviceA.createTransaction({
			type: "expense",
			categoryId: catA.id,
			amountCents: 3000,
			occurredAt: "2026-07-14",
		});

		// B tenta arquivar a transação de A — deve falhar com NOT_FOUND
		await expectNotFound(serviceB.archiveTransaction({ id: txnA.id }));

		// Confirma que a transação de A continua ativa
		const listA = await serviceA.listTransactions({ scope: "active" });
		expect(listA.items.some((t) => t.id === txnA.id)).toBe(true);
	});

	it("B não consegue restaurar categoria de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "expense",
			name: "Para arquivar",
			colorKey: "cyan",
			iconKey: "CircleDollarSign",
		});
		await serviceA.archiveCategory({ id: catA.id });

		// B tenta restaurar a categoria de A — deve falhar com NOT_FOUND
		await expectNotFound(serviceB.restoreCategory({ id: catA.id }));

		// Confirma que a categoria de A continua arquivada
		const archivedA = await serviceA.listCategories({ status: "archived" });
		expect(archivedA.some((c) => c.id === catA.id)).toBe(true);
	});

	it("B não consegue restaurar transação de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "expense",
			name: "Despesa para arquivar",
			colorKey: "teal",
			iconKey: "Tags",
		});
		const txnA = await serviceA.createTransaction({
			type: "expense",
			categoryId: catA.id,
			amountCents: 1000,
			occurredAt: "2026-07-13",
		});
		await serviceA.archiveTransaction({ id: txnA.id });

		// B tenta restaurar a transação de A — deve falhar com NOT_FOUND
		await expectNotFound(serviceB.restoreTransaction({ id: txnA.id }));

		// Confirma que a transação de A continua arquivada
		const archivedA = await serviceA.listTransactions({ scope: "archived" });
		expect(archivedA.items.some((t) => t.id === txnA.id)).toBe(true);
	});

	it("dashboard de B não inclui transações de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "income",
			name: "Salário do A",
			colorKey: "emerald",
			iconKey: "BriefcaseBusiness",
		});
		await serviceA.createTransaction({
			type: "income",
			categoryId: catA.id,
			amountCents: 500000,
			occurredAt: "2026-07-15",
			description: "Salário de A",
		});

		// Dashboard de B não deve incluir a renda de A
		const dashB = await serviceB.getDashboard();
		expect(dashB.month.incomeCents).toBe(0);
	});

	it("relatório de B não inclui transações de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "expense",
			name: "Despesa do A",
			colorKey: "rose",
			iconKey: "HeartPulse",
		});
		await serviceA.createTransaction({
			type: "expense",
			categoryId: catA.id,
			amountCents: 80000,
			occurredAt: "2026-07-10",
			description: "Despesa de A",
		});

		// Relatório de B não deve incluir a despesa de A
		const reportB = await serviceB.getReport({
			granularity: "month",
			anchorDate: "2026-07-15",
		});
		expect(reportB.expenseCents).toBe(0);
	});

	it("leitura paginada de B não vaza transações de A", async () => {
		const { serviceA, serviceB } = await setup();

		const catA = await serviceA.createCategory({
			type: "expense",
			name: "Categoria do A",
			colorKey: "blue",
			iconKey: "House",
		});

		await serviceA.createTransaction({
			type: "expense",
			categoryId: catA.id,
			amountCents: 1000,
			occurredAt: "2026-07-12",
			description: "Transação privada de A",
		});

		// B cria suas próprias transações
		const catB = await serviceB.createCategory({
			type: "expense",
			name: "Categoria do B",
			colorKey: "orange",
			iconKey: "Utensils",
		});
		for (let index = 0; index < 31; index++) {
			await serviceB.createTransaction({
				type: "expense",
				categoryId: catB.id,
				amountCents: 500 + index,
				occurredAt: "2026-07-12",
				description: `Transação do B ${index}`,
			});
		}

		const firstPage = await serviceB.listTransactions({ scope: "active" });
		expect(firstPage.items).toHaveLength(30);
		expect(firstPage.items.every((item) => item.categoryId === catB.id)).toBe(
			true,
		);
		expect(firstPage.nextCursor).toEqual(expect.any(String));

		const secondPage = await serviceB.listTransactions({
			scope: "active",
			cursor: firstPage.nextCursor ?? undefined,
		});
		expect(secondPage.items).toHaveLength(1);
		expect(secondPage.items[0].categoryId).toBe(catB.id);
	});
});
