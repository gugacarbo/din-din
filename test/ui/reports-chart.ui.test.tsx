import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { cloneElement, isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
	Cell: "div",
	Legend: "div",
	Pie: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ResponsiveContainer: ({
		children,
		height,
		width,
	}: {
		children: ReactNode;
		height?: number;
		width?: number | string;
	}) => (
		<div data-height={height} data-testid="responsive-container" data-width={width}>
			{children}
		</div>
	),
	// Simula um tooltip ativo para exercitar ChartTooltipContent + formatter.
	Tooltip: ({ content }: { content?: ReactNode }) =>
		isValidElement(content) ? (
			<div data-testid="tooltip-active">
				{cloneElement(content, {
					active: true,
					payload: [
						{
							dataKey: "amountCents",
							name: "Mercado",
							value: 1250,
							type: "circle",
							payload: {
								amountCents: 1250,
								category: "Mercado",
								fill: "#f97316",
							},
						},
					],
				})}
			</div>
		) : null,
}));

import { ReportsChart } from "#/components/finance/reports-chart.tsx";

describe("ReportsChart", () => {
	it("keeps the donut charts visible with explicit dimensions", () => {
		render(
			<ReportsChart
				data={[{ amountCents: 1250, category: "Mercado", fill: "#f97316" }]}
				grouping="categoria"
				kind="expense"
				totalCents={1250}
			/>,
		);

		expect(screen.getByTestId("responsive-container")).toHaveAttribute(
			"data-width",
			"160",
		);
		expect(screen.getByTestId("responsive-container")).toHaveAttribute(
			"data-height",
			"160",
		);
	});

	it("summarizes the total in the donut center and formats the tooltip amount", () => {
		render(
			<ReportsChart
				data={[
					{ amountCents: 1000, category: "Mercado", fill: "#f97316" },
					{ amountCents: 23456, category: "Salário", fill: "#10b981" },
				]}
				grouping="origem"
				kind="income"
				totalCents={24456}
			/>,
		);

		expect(
			screen.getByRole("img", { name: "Distribuição de receitas por origem" }),
		).toBeInTheDocument();
		expect(screen.getByText(/R\$\s*244,56/)).toBeInTheDocument();
		expect(screen.getByText(/R\$\s*244,56/).parentElement).toHaveTextContent(
			"em receitas",
		);

		const tooltip = screen.getByTestId("tooltip-active");
		expect(tooltip).toHaveTextContent("R$ 12,50");
		expect(within(tooltip).getByText(/R\$\s*12,50/)).toBeInTheDocument();
	});

	it("shows an empty-state message for expenses without data", () => {
		render(
			<ReportsChart data={[]} grouping="categoria" kind="expense" totalCents={0} />,
		);

		expect(
			screen.getByRole("status", {
				name: "Distribuição de despesas por categoria",
			}),
		).toHaveTextContent("Nenhuma despesa no período.");
		expect(screen.queryByTestId("responsive-container")).not.toBeInTheDocument();
	});

	it("shows an empty-state message for income without data", () => {
		render(
			<ReportsChart
				data={[]}
				grouping="destino"
				kind="income"
				totalCents={0}
			/>,
		);

		expect(
			screen.getByRole("status", {
				name: "Distribuição de receitas por destino",
			}),
		).toHaveTextContent("Nenhuma receita no período.");
	});
});
