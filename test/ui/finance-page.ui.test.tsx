import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	archiveCategory: vi.fn(), archiveTransaction: vi.fn(), archivePaymentMethod: vi.fn(), createCategory: vi.fn(), createPaymentMethod: vi.fn(), createTransaction: vi.fn(),
	getDashboard: vi.fn(), getReport: vi.fn(), listCategories: vi.fn(), listTransactions: vi.fn(),
	listPaymentMethods: vi.fn(), listInvoices: vi.fn(), restoreCategory: vi.fn(), restorePaymentMethod: vi.fn(), restoreTransaction: vi.fn(), updateCategory: vi.fn(), updatePaymentMethod: vi.fn(), updateTransaction: vi.fn(),
}));

vi.mock("#/server/finance.ts", () => api);
vi.mock("#/lib/auth-client.ts", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => createElement("a", { href: to, ...props }, children),
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

const expenseCategory = { id: "22222222-2222-4222-8222-222222222222", type: "expense", name: "Mercado", colorKey: "orange", iconKey: "Utensils", parentCategoryId: null, level: 1 as const, path: ["22222222-2222-4222-8222-222222222222"], archivedAt: null, createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" };
const incomeCategory = { ...expenseCategory, id: "11111111-1111-4111-8111-111111111111", type: "income", name: "Salário", colorKey: "emerald", iconKey: "BriefcaseBusiness" };
const transaction = { id: "33333333-3333-4333-8333-333333333333", type: "expense", categoryId: expenseCategory.id, category: expenseCategory, paymentMethodId: null, paymentMethod: null, amountCents: 1200, currency: "BRL" as const, occurredAt: "2024-02-10", description: "antes", invoiceCycleClosingDate: null, invoiceCycleDueDate: null, archivedAt: null, createdAt: "2024-02-10T00:00:00.000Z", updatedAt: "2024-02-10T00:00:00.000Z" };

describe("FinancePage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		api.getDashboard.mockResolvedValue({ month: { incomeCents: 0, expenseCents: 0, balanceCents: 0 }, incomeByPaymentMethod: [], recentTransactions: [] });
		api.listCategories.mockResolvedValue([incomeCategory, expenseCategory]);
		api.listTransactions.mockResolvedValue({ items: [transaction], nextCursor: null });
		api.listPaymentMethods.mockResolvedValue([]);
		api.listInvoices.mockResolvedValue([]);
		api.getReport.mockResolvedValue({ period: { granularity: "month", anchorDate: "2024-02-10", startDate: "2024-02-01", endDate: "2024-03-01" }, incomeCents: 0, expenseCents: 0, balanceCents: 0, expenseByCategory: [], expenseCategoryTree: [], incomeByPaymentMethod: [] });
	});

	it("requires an explicit type before allowing a new transaction", async () => {
		const user = userEvent.setup();
		render(<FinancePage kind="dashboard" />);
		await screen.findByText("Seu mês em movimento");
		await user.click(screen.getByRole("button", { name: /novo lançamento/i }));
		await waitFor(() => expect(api.listCategories).toHaveBeenCalled());
		const type = screen.getByLabelText("Tipo");
		expect(type).toHaveTextContent("Selecione o tipo");
		expect(screen.getByLabelText("Categoria")).toBeDisabled();
		await user.click(screen.getByRole("button", { name: /adicionar lançamento/i }));
		expect(await screen.findByText("Escolha o tipo do lançamento antes de salvar.")).toHaveAttribute("role", "alert");
		expect(type).toHaveAttribute("aria-invalid", "true");
	});

	it("preserves the persisted type while editing", async () => {
		const user = userEvent.setup();
		api.updateTransaction.mockResolvedValue(transaction);
		render(<FinancePage kind="transactions" />);
		await waitFor(() => expect(api.listTransactions).toHaveBeenCalled());
		await screen.findByText(/antes/);
		await user.click(screen.getByRole("button", { name: "Editar lançamento" }));
		expect(screen.getByLabelText("Tipo")).toHaveTextContent("Despesa");
		expect(screen.getByLabelText("Categoria")).toHaveTextContent("Mercado");
		const saveButton = screen.getByRole("button", {
			name: /salvar alterações/i,
		});
		const footer = saveButton.parentElement;
		if (!footer) throw new Error("Rodapé do formulário ausente.");
		expect(footer).toHaveClass("flex-row");
		await user.click(saveButton);
		await waitFor(() => expect(api.updateTransaction).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "expense" }) })));
	});

	it("opens the shared transaction details dialog from a transaction row", async () => {
		const user = userEvent.setup();
		render(<FinancePage kind="transactions" />);
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

	it("exposes the real mobile Archive navigation", async () => {
		render(<FinancePage kind="dashboard" />);
		const nav = screen.getByRole("navigation", { name: "Navegação mobile" });
		const link = within(nav).getByRole("link", { name: "Arquivo" });
		expect(link).toHaveAttribute("href", "/archive");
		expect(nav).toHaveClass("md:hidden");
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
		render(<FinancePage kind="categories" />);
		expect(await screen.findByText("— Restaurante")).toBeInTheDocument();
	});

	it("shows each category icon in the shared category selectors", async () => {
		const user = userEvent.setup();
		render(<FinancePage kind="transactions" />);
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
		render(<FinancePage kind="categories" />);
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
			balanceCents: -3000,
			expenseByCategory: [],
			expenseCategoryTree: [{ category: expenseCategory, directAmountCents: 1000, aggregateAmountCents: 3000, children: [{ category: child, directAmountCents: 2000, aggregateAmountCents: 2000, children: [] }] }],
			incomeByPaymentMethod: [],
		});
		const user = userEvent.setup();
		render(<FinancePage kind="reports" />);
		await screen.findByText("Mercado");
		expect(screen.getByText("Restaurante")).toBeInTheDocument();
		expect(screen.getByText(/Direto: R\$ 10,00 · Agregado: R\$ 30,00/)).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Recolher Mercado" }));
		expect(screen.queryByText("Restaurante")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Expandir Mercado" }));
		expect(screen.getByText("Restaurante")).toBeInTheDocument();
	});
});
