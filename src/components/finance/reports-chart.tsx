import { Cell, Pie, PieChart } from "recharts";

import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart.tsx";

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

export type ReportChartItem = {
	amountCents: number;
	category: string;
	fill: string;
};

export function ReportsChart({
	data,
	totalCents,
	kind,
	grouping,
}: {
	data: ReportChartItem[];
	totalCents: number;
	kind: "income" | "expense";
	grouping: string;
}) {
	const config = Object.fromEntries(
		data.map((item) => [item.category, { label: item.category }]),
	);
	const formatMoney = (value: number) => money.format(value / 100);
	const noun = kind === "income" ? "receitas" : "despesas";
	const singular = kind === "income" ? "receita" : "despesa";
	if (!data.length)
		return (
			<div
				aria-label={`Distribuição de ${noun} por ${grouping}`}
				className="grid min-h-40 place-items-center text-center text-sm text-muted-foreground"
				role="status"
			>
				Nenhuma {singular} no período.
			</div>
		);

	return (
		<div className="relative mx-auto size-40">
			<ChartContainer
				aria-label={`Distribuição de ${noun} por ${grouping}`}
				className="size-40"
				config={config}
				responsiveContainerProps={{
					height: 160,
					width: 160,
				}}
				role="img"
			>
				<PieChart>
					<ChartTooltip
						content={
							<ChartTooltipContent
								formatter={(value) => formatMoney(Number(value))}
								nameKey="category"
							/>
						}
					/>
					<Pie
						data={data}
						dataKey="amountCents"
						innerRadius={48}
						nameKey="category"
						outerRadius={76}
						strokeWidth={4}
					>
						{data.map((item) => (
							<Cell fill={item.fill} key={item.category} />
						))}
					</Pie>
				</PieChart>
			</ChartContainer>
			<div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-xs font-bold text-card-foreground">
				<div>
					{formatMoney(totalCents)}
					<br />
					em {noun}
				</div>
			</div>
		</div>
	);
}
