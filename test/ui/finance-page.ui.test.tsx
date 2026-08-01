import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "./viewport.ts";

const api = vi.hoisted(() => ({
	archiveCategory: vi.fn(), archiveTransaction: vi.fn(), archivePaymentMethod: vi.fn(), createCategory: vi.fn(), createPaymentMethod: vi.fn(), createTransaction: vi.fn(), routerBack: vi.fn(),
	getDashboard: vi.fn(), getReport: vi.fn(), getSessionUser: vi.fn(), listActivity: vi.fn(), listCategories: vi.fn(), listTransactions: vi.fn(),
	listPaymentMethods: vi.fn(), listInvoices: vi.fn(), removeInvoicePayment: vi.fn(), restoreCategory: vi.fn(), restorePaymentMethod: vi.fn(), restoreTransaction: vi.fn(), saveInvoicePayment: vi.fn(), updateCategory: vi.fn(), updatePaymentMethod: vi.fn(), updateTransaction: vi.fn(),
}));

vi.mock("#/server/finance.ts", () => api);
vi.mock("#/lib/auth-client.ts", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => createElement("a", { href: to, ...props }, children),
	useCanGoBack: () => true,
	useRouter: () => ({ history: { back: api.routerBack } }),
	useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) => select({ location: { pathname: "/" } }),
}));
vi.mock("recharts", () => ({
	Cell: "div",
	Pie: "div",
	PieChart: "div",
	ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
	Tooltip: () => null,
	Legend: () => null,
}));

import { FinancePage } from "#/components/finance/finance-page.tsx";
import {
	currentSaoPauloMonth,
	inclusivePeriodToTechnical,
} from "#/lib/finance.ts";

function renderFinancePage(kind: ComponentProps<typeof FinancePage>["kind"]) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<FinancePage kind={kind} />
		</QueryClientProvider>,
	);
}

function setOnline(value: boolean) {
	Object.defineProperty(window.navigator, "onLine", {
		configurable: true,
		value,
	});
	window.dispatchEvent(new Event(value ? "online" : "offline"));
}

const expenseCategory = { id: "22222222-2222-4222-8222-222222222222", type: "expense", name: "Mercado", colorKey: "orange", iconKey: "Utensils", parentCategoryId: null, level: 1 as const, path: ["22222222-2222-4222-8222-222222222222"], archivedAt: null, createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" };
const incomeCategory = { ...expenseCategory, id: "11111111-1111-4111-8111-111111111111", type: "income", name: "Salário", colorKey: "emerald", iconKey: "BriefcaseBusiness" };
const creditCard = { id: "66666666-6666-4666-8666-666666666666", name: "Cartão teste", kind: "credit_card" as const, colorKey: "indigo", iconKey: "CreditCard", invoiceControl: true, closingDay: 25, dueDay: 5, archivedAt: null, createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" };
const transaction = { id: "33333333-3333-4333-8333-333333333333", type: "expense", categoryId: expenseCategory.id, category: expenseCategory, paymentMethodId: null, paymentMethod: null, amountCents: 1200, currency: "BRL" as const, occurredAt: "2024-02-10", description: "antes", installmentPlan: null, archivedAt: null, createdAt: "2024-02-10T00:00:00.000Z", updatedAt: "2024-02-10T00:00:00.000Z" };

describe("FinancePage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setViewportWidth(375);
		setOnline(true);
		api.getDashboard.mockResolvedValue({ month: { incomeCents: 0, expenseCents: 0, balanceCents: 0 }, incomeByPaymentMethod: [], recentActivity: [] });
		api.getSessionUser.mockResolvedValue({ id: "user-1", name: "Ana Silva", email: "ana@example.com", image: null });
		api.listCategories.mockResolvedValue([incomeCategory, expenseCategory]);
		api.listTransactions.mockResolvedValue({ items: [transaction], nextCursor: null });
		api.listActivity.mockResolvedValue({ items: [{ kind: "transaction", activityDate: transaction.occurredAt, transaction }], nextCursor: null });
		api.listPaymentMethods.mockResolvedValue([]);
		api.listInvoices.mockResolvedValue({ items: [], nextCursor: null });
		api.getReport.mockResolvedValue({ period: { granularity: "month", anchorDate: "2024-02-10", startDate: "2024-02-01", endDate: "2024-03-01" }, incomeCents: 0, expenseCents: 0, unregisteredExpenseCents: 0, balanceCents: 0, expenseByCategory: [], expenseCategoryTree: [], incomeByPaymentMethod: [] });
	});

	it("requires an explicit type before allowing a new transaction", async () => {
		const user = userEvent.setup();
		renderFinancePage("dashboard");
		await screen.findByText("Suas finanças em movimento");
		await user.click(screen.getByRole("button", { name: /novo lançamento/i }));
		await waitFor(() => expect(api.listCategories).toHaveBeenCalled());
		const type = screen.getByLabelText("Tipo");
		expect(type).toHaveTextContent("Selecione o tipo");
		expect(screen.getByLabelText("Categoria")).toBeDisabled();
		await user.click(screen.getByRole("button", { name: /adicionar lançamento/i }));
		expect(await screen.findByText("Escolha o tipo do lançamento antes de salvar.")).toHaveAttribute("role", "alert");
		expect(type).toHaveAttribute("aria-invalid", "true");
	});

	it("refreshes dashboard summaries and recent transactions after creating one", async () => {
		const createdTransaction = {
			...transaction,
			id: "88888888-8888-4888-8888-888888888888",
			amountCents: 4567,
			description: "compra do teste",
		};
		api.createTransaction.mockResolvedValue(createdTransaction);
		api.getDashboard
			.mockResolvedValueOnce({
				month: { incomeCents: 0, expenseCents: 0, balanceCents: 0 },
				incomeByPaymentMethod: [],
				recentActivity: [],
			})
			.mockResolvedValueOnce({
				month: {
					incomeCents: 0,
					expenseCents: createdTransaction.amountCents,
					balanceCents: -createdTransaction.amountCents,
				},
				incomeByPaymentMethod: [],
				recentActivity: [
					{
						kind: "transaction",
						activityDate: createdTransaction.occurredAt,
						transaction: createdTransaction,
					},
				],
			});

		const user = userEvent.setup();
		renderFinancePage("dashboard");
		await screen.findByText("Suas finanças em movimento");
		expect(screen.getByText("Nenhuma atividade por aqui.")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /novo lançamento/i }));
		await user.click(screen.getByLabelText("Tipo"));
		await user.click(await screen.findByRole("option", { name: "Despesa" }));
		await user.click(screen.getByLabelText("Categoria"));
		await user.click(await screen.findByRole("option", { name: "Mercado" }));
		await user.clear(screen.getByLabelText("Valor (R$)"));
		await user.type(screen.getByLabelText("Valor (R$)"), "4567");
		await user.type(
			screen.getByLabelText("Descrição opcional"),
			"compra do teste",
		);
		await user.click(
			screen.getByRole("button", { name: "Adicionar lançamento" }),
		);

		await waitFor(() =>
			expect(api.createTransaction).toHaveBeenCalledWith({
				data: expect.objectContaining({
					type: "expense",
					categoryId: expenseCategory.id,
					amountCents: 4567,
					description: "compra do teste",
				}),
			}),
		);
		await waitFor(() => expect(api.getDashboard).toHaveBeenCalledTimes(2));

		const expenseSummary = screen.getByText("Saídas").closest("[data-slot=card]");
		const balanceSummary = screen.getByText("Saldo").closest("[data-slot=card]");
		const recentCard = screen
			.getByText("Últimos lançamentos")
			.closest("[data-slot=card]");
		if (!expenseSummary || !balanceSummary || !recentCard)
			throw new Error("Cards do dashboard ausentes.");
		expect(within(expenseSummary).getByText("R$ 45,67")).toBeInTheDocument();
		expect(within(balanceSummary).getByText("-R$ 45,67")).toBeInTheDocument();
		expect(within(recentCard).getByText("Mercado")).toBeInTheDocument();
		expect(within(recentCard).getByText(/compra do teste/)).toBeInTheDocument();
		expect(
			within(recentCard).queryByText("Nenhuma atividade por aqui."),
		).not.toBeInTheDocument();
	});

	it("starts with the current São Paulo month and an exclusive query end", async () => {
		renderFinancePage("dashboard");

		await waitFor(() => expect(api.getDashboard).toHaveBeenCalledOnce());
		await screen.findByText("Período do dashboard");
		const initialMonth = currentSaoPauloMonth();
		expect(api.getDashboard).toHaveBeenCalledWith({
			data: inclusivePeriodToTechnical(initialMonth),
		});
		expect(screen.getByLabelText("Data inicial")).toHaveValue(
			initialMonth.startDate,
		);
		expect(screen.getByLabelText("Data final")).toHaveValue(
			initialMonth.endDate,
		);
	});

	it("applies an inclusive one-day interval with the next day as technical end", async () => {
		const user = userEvent.setup();
		renderFinancePage("dashboard");
		await waitFor(() => expect(api.getDashboard).toHaveBeenCalledOnce());
		await screen.findByText("Período do dashboard");

		const startDate = screen.getByLabelText("Data inicial");
		const endDate = screen.getByLabelText("Data final");
		await user.clear(startDate);
		await user.type(startDate, "2024-02-29");
		await user.clear(endDate);
		await user.type(endDate, "2024-02-29");
		await user.click(screen.getByRole("button", { name: "Aplicar intervalo" }));

		await waitFor(() =>
			expect(api.getDashboard).toHaveBeenLastCalledWith({
				data: { startDate: "2024-02-29", endDate: "2024-03-01" },
			}),
		);
	});

	it("uses a reference date as a shortcut to the complete month", async () => {
		const user = userEvent.setup();
		renderFinancePage("dashboard");
		await waitFor(() => expect(api.getDashboard).toHaveBeenCalledOnce());
		await screen.findByText("Período do dashboard");

		const referenceDate = screen.getByLabelText("Data de referência");
		await user.clear(referenceDate);
		await user.type(referenceDate, "2024-02-10");
		await user.click(
			screen.getByRole("button", { name: "Selecionar mês completo" }),
		);

		expect(screen.getByLabelText("Data inicial")).toHaveValue("2024-02-01");
		expect(screen.getByLabelText("Data final")).toHaveValue("2024-02-29");
		await waitFor(() =>
			expect(api.getDashboard).toHaveBeenLastCalledWith({
				data: { startDate: "2024-02-01", endDate: "2024-03-01" },
			}),
		);
	});

	it("keeps the last dashboard result when the interval is incomplete or invalid", async () => {
		api.getDashboard.mockResolvedValue({
			month: { incomeCents: 1234, expenseCents: 0, balanceCents: 1234 },
			incomeByPaymentMethod: [],
			recentActivity: [],
		});
		const user = userEvent.setup();
		renderFinancePage("dashboard");
		await screen.findAllByText("R$ 12,34");
		expect(api.getDashboard).toHaveBeenCalledOnce();

		await user.clear(screen.getByLabelText("Data final"));
		await user.click(screen.getByRole("button", { name: "Aplicar intervalo" }));
		expect(
			await screen.findByText("Informe uma data final válida."),
		).toHaveAttribute("role", "alert");
		expect(api.getDashboard).toHaveBeenCalledOnce();
		expect(screen.getAllByText("R$ 12,34")).not.toHaveLength(0);

		await user.type(screen.getByLabelText("Data final"), "2024-02-01");
		await user.clear(screen.getByLabelText("Data inicial"));
		await user.type(screen.getByLabelText("Data inicial"), "2024-03-01");
		await user.click(screen.getByRole("button", { name: "Aplicar intervalo" }));
		expect(
			await screen.findByText(
				"A data final deve ser igual ou posterior à inicial.",
			),
		).toHaveAttribute("role", "alert");
		expect(api.getDashboard).toHaveBeenCalledOnce();

		await user.clear(screen.getByLabelText("Data inicial"));
		await user.type(screen.getByLabelText("Data inicial"), "9999-12-31");
		await user.clear(screen.getByLabelText("Data final"));
		await user.type(screen.getByLabelText("Data final"), "9999-12-31");
		await user.click(screen.getByRole("button", { name: "Aplicar intervalo" }));
		expect(
			await screen.findByText(
				"Escolha uma data final anterior a 31/12/9999.",
			),
		).toHaveAttribute("role", "alert");
		expect(api.getDashboard).toHaveBeenCalledOnce();
	});

	it("keeps every period control reachable in order by keyboard on mobile", async () => {
		const user = userEvent.setup();
		renderFinancePage("dashboard");
		await screen.findByText("Período do dashboard");

		screen.getByLabelText("Data inicial").focus();
		expect(screen.getByLabelText("Data inicial")).toHaveFocus();
		await user.tab();
		expect(screen.getByLabelText("Data final")).toHaveFocus();
		await user.tab();
		expect(
			screen.getByRole("button", { name: "Aplicar intervalo" }),
		).toHaveFocus();
		await user.tab();
		expect(screen.getByLabelText("Data de referência")).toHaveFocus();
		await user.tab();
		expect(
			screen.getByRole("button", { name: "Selecionar mês completo" }),
		).toHaveFocus();
	});

	it("uses a mobile drawer and a double-height description textarea", async () => {
		const user = userEvent.setup();
		renderFinancePage("dashboard");
		await screen.findByText("Suas finanças em movimento");
		await user.click(screen.getByRole("button", { name: /novo lançamento/i }));

		const drawer = await screen.findByRole("dialog");
		expect(drawer).toHaveAttribute("data-slot", "sheet-content");
		expect(
			within(drawer).getByRole("slider", {
				name: "Ajustar altura do drawer",
			}),
		).toBeInTheDocument();
		const actions = drawer.querySelector('[data-slot="drawer-form-actions"]');
		if (!actions) throw new Error("Ações do formulário ausentes.");
		const actionButtons = within(actions).getAllByRole("button");
		expect(actionButtons.map((button) => button.textContent)).toEqual([
			"Cancelar",
			"Adicionar lançamento",
		]);
		expect(actionButtons[0]).toHaveClass("h-12", "w-full");
		const description = screen.getByLabelText("Descrição opcional");
		expect(description).toHaveAttribute("data-slot", "textarea");
		expect(description).toHaveClass("min-h-18");
	});

	it("preserves the persisted type while editing", async () => {
		const user = userEvent.setup();
		api.updateTransaction.mockResolvedValue(transaction);
		renderFinancePage("transactions");
		await waitFor(() => expect(api.listActivity).toHaveBeenCalled());
		await screen.findByText(/antes/);
		await user.click(screen.getByRole("button", { name: "Editar lançamento" }));
		expect(screen.getByLabelText("Tipo")).toHaveTextContent("Despesa");
		expect(screen.getByLabelText("Categoria")).toHaveTextContent("Mercado");
		const saveButton = screen.getByRole("button", {
			name: /salvar alterações/i,
		});
		const footer = saveButton.parentElement;
		if (!footer) throw new Error("Rodapé do formulário ausente.");
		expect(footer).toHaveClass("grid", "grid-cols-2");
		await user.click(saveButton);
		await waitFor(() => expect(api.updateTransaction).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "expense" }) })));
	});

	it("opens the shared transaction details dialog from a transaction row", async () => {
		const user = userEvent.setup();
		renderFinancePage("transactions");
		await screen.findByText(/antes/);
		await user.click(
			screen.getByRole("button", { name: "Ver lançamento Mercado" }),
		);
		const dialog = await screen.findByRole("dialog");
		expect(dialog).toHaveAttribute("data-slot", "sheet-content");
		expect(
			within(dialog).getByRole("slider", {
				name: "Ajustar altura do drawer",
			}),
		).toBeInTheDocument();
		expect(within(dialog).getByText("Detalhes do lançamento")).toBeInTheDocument();
		expect(within(dialog).getByText("Não informado")).toBeInTheDocument();
		expect(within(dialog).getByText("antes")).toBeInTheDocument();
	});

	it("keeps the mobile sidebar available through its trigger", async () => {
		const user = userEvent.setup();
		renderFinancePage("dashboard");
		await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
		expect(await screen.findByRole("link", { name: "Relatórios" })).toHaveAttribute(
			"href",
			"/reports",
		);
	});

	it("opens settings choices from the Profile page", async () => {
		const user = userEvent.setup();
		renderFinancePage("profile");

		expect(await screen.findByRole("heading", { name: "Perfil" })).toBeInTheDocument();
		expect(await screen.findByText("Ana Silva")).toBeInTheDocument();
		expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Configurações" }));
		const sheet = await screen.findByRole("dialog");
		expect(within(sheet).getByRole("link", { name: "Categorias" })).toHaveAttribute(
			"href",
			"/categories",
		);
		expect(
			within(sheet).getByRole("link", { name: "Formas de pagamento" }),
		).toHaveAttribute("href", "/payments");
	});

	it("offers the Archive from History instead of the mobile navigation", async () => {
		renderFinancePage("transactions");
		const archiveLink = await screen.findByRole("link", { name: "Arquivo" });

    expect(archiveLink).toHaveAttribute("href", "/transactions/archive");
		expect(archiveLink).toBeVisible();
  });

	it("returns from Archive through router history", async () => {
		const user = userEvent.setup();
		renderFinancePage("archive");

		await user.click(
			await screen.findByRole("button", {
				name: "Voltar para lançamentos",
			}),
		);

		expect(api.routerBack).toHaveBeenCalledOnce();
	});

	it("does not eagerly prefetch every sidebar destination", async () => {
		renderFinancePage("dashboard");

		await waitFor(() => expect(api.getDashboard).toHaveBeenCalled());
		expect(api.getReport).not.toHaveBeenCalled();
		expect(api.listCategories).not.toHaveBeenCalled();
		expect(api.listPaymentMethods).not.toHaveBeenCalled();
		expect(api.listInvoices).not.toHaveBeenCalled();
		expect(api.listActivity).not.toHaveBeenCalled();
		expect(api.listTransactions).not.toHaveBeenCalled();
	});

	it("keeps the cached finance view read-only while offline", async () => {
		const user = userEvent.setup();
		setOnline(false);
		renderFinancePage("dashboard");

		expect(
			await screen.findByRole("status"),
		).toHaveTextContent("Esta visualização é somente leitura.");
		expect(document.querySelector("[inert]")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /novo lançamento/i }),
		).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
		expect(await screen.findByRole("link", { name: "Relatórios" })).toHaveAttribute(
			"href",
			"/reports",
		);
	});

	it("keeps the desktop sidebar navigation available at 1024px", async () => {
		setViewportWidth(1024);
		renderFinancePage("dashboard");

		expect(await screen.findByRole("list", { name: "Principal" })).toBeVisible();
		expect(
			screen.queryByRole("navigation", { name: "Navegação mobile" }),
		).not.toBeInTheDocument();
	});

	it("preserves an archived category while editing its existing transaction", async () => {
		const user = userEvent.setup();
		const archivedCategory = {
			...expenseCategory,
			id: "77777777-7777-4777-8777-777777777777",
			name: "Mercado antigo",
			archivedAt: "2024-03-01T00:00:00.000Z",
		};
		const archivedReference = {
			...transaction,
			categoryId: archivedCategory.id,
			category: archivedCategory,
		};
		api.listActivity.mockResolvedValue({
			items: [
				{
					kind: "transaction",
					activityDate: archivedReference.occurredAt,
					transaction: archivedReference,
				},
			],
			nextCursor: null,
		});
		api.updateTransaction.mockResolvedValue(archivedReference);

		renderFinancePage("transactions");
		await user.click(
			await screen.findByRole("button", { name: "Editar lançamento" }),
		);

		expect(screen.getByLabelText("Categoria")).toHaveTextContent(
			"Mercado antigo (Arquivada)",
		);
		await user.click(
			screen.getByRole("button", { name: /salvar alterações/i }),
		);
		await waitFor(() =>
			expect(api.updateTransaction).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						categoryId: archivedCategory.id,
					}),
				}),
			),
		);
	});

	it("keeps the last valid report while its date field is incomplete", async () => {
		const user = userEvent.setup();
		renderFinancePage("reports");
		await screen.findByText("Para onde foi seu dinheiro");
		await waitFor(() => expect(api.getReport).toHaveBeenCalled());
		api.getReport.mockClear();

		const date = screen.getByLabelText("Data de referência");
		await user.clear(date);

		expect(date).toHaveAttribute("aria-invalid", "true");
		expect(api.getReport).not.toHaveBeenCalled();
		expect(screen.getByText("Entradas")).toBeInTheDocument();
	});

	it("shows the category hierarchy in the category manager", async () => {
		const child = {
			...expenseCategory,
			id: "55555555-5555-4555-8555-555555555555",
			name: "Restaurante",
			parentCategoryId: expenseCategory.id,
			level: 2 as const,
			path: [expenseCategory.id, "55555555-5555-4555-8555-555555555555"],
		};
		api.listCategories.mockResolvedValue([expenseCategory, child]);
		renderFinancePage("categories");
		expect(await screen.findByText("— Restaurante")).toBeInTheDocument();
	});

	it("returns through router history from both configuration pages", async () => {
		const user = userEvent.setup();
		const categoriesPage = renderFinancePage("categories");
		await user.click(await screen.findByRole("button", { name: "Voltar" }));
		expect(api.routerBack).toHaveBeenCalledTimes(1);

		categoriesPage.unmount();
		renderFinancePage("payments");
		await user.click(screen.getByRole("button", { name: "Voltar" }));
		expect(api.routerBack).toHaveBeenCalledTimes(2);
	});

	it("uses the shared drawer and fixed actions for category forms", async () => {
		const user = userEvent.setup();
		renderFinancePage("categories");
		await user.click(screen.getByRole("button", { name: "Nova" }));

		const drawer = await screen.findByRole("dialog");
		expect(within(drawer).getByText("Nova categoria")).toBeInTheDocument();
		expect(
			within(drawer).getByRole("slider", {
				name: "Ajustar altura do drawer",
			}),
		).toBeInTheDocument();
		const actions = drawer.querySelector('[data-slot="drawer-form-actions"]');
		if (!actions) throw new Error("Ações da categoria ausentes.");
		expect(within(actions).getAllByRole("button").map((button) => button.textContent)).toEqual([
			"Cancelar",
			"Criar categoria",
		]);
	});

	it("uses the shared drawer and fixed actions for payment method forms", async () => {
		const user = userEvent.setup();
		renderFinancePage("payments");
		await user.click(screen.getByRole("button", { name: "Nova forma" }));

		const drawer = await screen.findByRole("dialog");
		expect(
			within(drawer).getByText("Nova forma de pagamento"),
		).toBeInTheDocument();
		expect(
			within(drawer).getByRole("slider", {
				name: "Ajustar altura do drawer",
			}),
		).toBeInTheDocument();
		const actions = drawer.querySelector('[data-slot="drawer-form-actions"]');
		if (!actions) throw new Error("Ações da forma de pagamento ausentes.");
		expect(within(actions).getAllByRole("button").map((button) => button.textContent)).toEqual([
			"Cancelar",
			"Salvar forma",
		]);
	});

	it("renders projected installments and registers a settlement without calling createTransaction", async () => {
		const invoice = {
			paymentMethodId: creditCard.id,
			paymentMethod: creditCard,
			referenceMonth: "2024-07",
			cycleClosingDate: "2024-06-25",
			cycleDueDate: "2024-07-05",
			status: "projected" as const,
			payment: null,
			items: [{
				transactionId: transaction.id,
				occurredAt: "2024-06-20",
				description: "Notebook",
				amountCents: 333,
				category: expenseCategory,
				installmentNumber: 1,
				installmentCount: 3,
			}],
			itemsTotalCents: 333,
			effectiveExpenseCents: 333,
			unregisteredExpenseCents: 0,
			declaredOverPaymentCents: 0,
		};
		api.listPaymentMethods.mockResolvedValue([creditCard]);
		api.listInvoices.mockResolvedValue({ items: [invoice], nextCursor: null });
		api.saveInvoicePayment.mockResolvedValue({ ...invoice, status: "paid" });
		const user = userEvent.setup();
		renderFinancePage("payments");
		await user.click(screen.getByRole("tab", { name: "Faturas" }));
		expect(await screen.findByText(/fatura 2024-07/)).toBeInTheDocument();
		expect(screen.getByText(/1\/3/)).toBeInTheDocument();
		await user.click(
			screen.getAllByRole("button", { name: "Registrar pagamento" }).at(-1)!,
		);
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByLabelText("Mês da fatura")).toHaveValue("2024-07");
		await user.click(within(dialog).getByRole("button", { name: "Registrar pagamento" }));
		await waitFor(() =>
			expect(api.saveInvoicePayment).toHaveBeenCalledWith({
				data: expect.objectContaining({
					paymentMethodId: creditCard.id,
					referenceMonth: "2024-07",
					amountCents: 333,
				}),
			}),
		);
		expect(api.createTransaction).not.toHaveBeenCalled();
	});

	it("edits and removes an existing invoice settlement", async () => {
		const invoice = {
			paymentMethodId: creditCard.id,
			paymentMethod: creditCard,
			referenceMonth: "2024-07",
			cycleClosingDate: "2024-06-25",
			cycleDueDate: "2024-07-05",
			status: "paid" as const,
			payment: {
				id: "77777777-7777-4777-8777-777777777777",
				paymentMethodId: creditCard.id,
				referenceMonth: "2024-07",
				cycleClosingDate: "2024-06-25",
				cycleDueDate: "2024-07-05",
				paidAt: "2024-07-05",
				amountCents: 500,
				createdAt: "2024-07-05T00:00:00.000Z",
				updatedAt: "2024-07-05T00:00:00.000Z",
			},
			items: [],
			itemsTotalCents: 0,
			effectiveExpenseCents: 500,
			unregisteredExpenseCents: 500,
			declaredOverPaymentCents: 0,
		};
		api.listPaymentMethods.mockResolvedValue([creditCard]);
		api.listInvoices.mockResolvedValue({ items: [invoice], nextCursor: null });
		api.saveInvoicePayment.mockResolvedValue(invoice);
		api.removeInvoicePayment.mockResolvedValue({ removed: true });
		const user = userEvent.setup();
		renderFinancePage("payments");
		await user.click(screen.getByRole("tab", { name: "Faturas" }));
		await user.click(
			await screen.findByRole("button", { name: "Editar pagamento" }),
		);
		expect(await screen.findByRole("heading", { name: "Editar pagamento" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Salvar pagamento" }));
		await waitFor(() =>
			expect(api.saveInvoicePayment).toHaveBeenCalledWith({
				data: expect.objectContaining({
					paymentMethodId: creditCard.id,
					referenceMonth: "2024-07",
					amountCents: 500,
				}),
			}),
		);

		await user.click(
			await screen.findByRole("button", { name: "Editar pagamento" }),
		);
		await user.click(screen.getByRole("button", { name: "Remover pagamento" }));
		expect(await screen.findByRole("heading", { name: "Remover pagamento?" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Remover" }));
		await waitFor(() =>
			expect(api.removeInvoicePayment).toHaveBeenCalledWith({
				data: {
					paymentMethodId: creditCard.id,
					referenceMonth: "2024-07",
				},
			}),
		);
	});

	it("reveals installment controls only for an expense on a controlled credit card", async () => {
		api.listPaymentMethods.mockResolvedValue([creditCard]);
		const user = userEvent.setup();
		renderFinancePage("dashboard");
		await screen.findByText("Suas finanças em movimento");
		await user.click(screen.getByRole("button", { name: /novo lançamento/i }));
		await user.click(screen.getByLabelText("Tipo"));
		await user.click(await screen.findByRole("option", { name: "Despesa" }));
		await user.click(screen.getByLabelText("Forma de pagamento (opcional)"));
		await user.click(await screen.findByRole("option", { name: "Cartão teste" }));
		const installmentSwitch = await screen.findByRole("switch", {
			name: "Compra parcelada",
		});
		await user.click(installmentSwitch);
		expect(screen.getByLabelText("Quantidade de parcelas")).toHaveValue(2);
		expect(
			(screen.getByLabelText("Primeira fatura") as HTMLInputElement).value,
		).toMatch(/^\d{4}-\d{2}$/);
	});

	it("shows each category icon in the shared category selectors", async () => {
		const user = userEvent.setup();
		renderFinancePage("transactions");
		await screen.findByText(/antes/);
		await user.click(screen.getByRole("button", { name: /novo lançamento/i }));
		const transactionType = document.querySelector("#transaction-type");
		if (!transactionType) throw new Error("Seletor de tipo ausente.");
		await user.click(transactionType);
		await user.click(await screen.findByRole("option", { name: "Despesa" }));
		await user.click(screen.getByLabelText("Categoria"));
		const transactionOption = await screen.findByRole("option", {
			name: "Mercado",
		});
		expect(transactionOption.querySelector("svg")).not.toBeNull();

		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Cancelar" }));
		renderFinancePage("categories");
		await user.click(screen.getByRole("button", { name: /nova/i }));
		await user.click(screen.getByLabelText("Categoria pai (opcional)"));
		const parentOption = await screen.findByRole("option", {
			name: "Mercado",
		});
		expect(parentOption.querySelector("svg")).not.toBeNull();
	});

	it("renders expense categories as an expandable tree with direct and aggregate totals", async () => {
		const child = {
			...expenseCategory,
			id: "44444444-4444-4444-8444-444444444444",
			name: "Restaurante",
			parentCategoryId: expenseCategory.id,
			level: 2 as const,
			path: [expenseCategory.id, "44444444-4444-4444-8444-444444444444"],
		};
		api.getReport.mockResolvedValue({
			period: { granularity: "month", anchorDate: "2024-02-10", startDate: "2024-02-01", endDate: "2024-03-01" },
			incomeCents: 0,
			expenseCents: 3000,
			unregisteredExpenseCents: 0,
			balanceCents: -3000,
			expenseByCategory: [],
			expenseCategoryTree: [{ category: expenseCategory, directAmountCents: 1000, aggregateAmountCents: 3000, children: [{ category: child, directAmountCents: 2000, aggregateAmountCents: 2000, children: [] }] }],
			incomeByPaymentMethod: [],
		});
		const user = userEvent.setup();
		renderFinancePage("reports");
		await screen.findByText("Mercado");
		expect(screen.getByText("Restaurante")).toBeInTheDocument();
		expect(screen.getByText(/Direto: R\$ 10,00 · Agregado: R\$ 30,00/)).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Recolher Mercado" }));
		expect(screen.queryByText("Restaurante")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Expandir Mercado" }));
		expect(screen.getByText("Restaurante")).toBeInTheDocument();
	});
});
