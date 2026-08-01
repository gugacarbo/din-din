import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "#/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	civilMonthFor,
	currentSaoPauloMonth,
	inclusivePeriodToTechnical,
	isCivilDate,
	saoPauloToday,
	type TechnicalCivilPeriod,
} from "#/lib/finance.ts";

const periodFilterSchema = z
	.object({
		startDate: z
			.string()
			.refine(isCivilDate, "Informe uma data inicial válida."),
		endDate: z.string().refine(isCivilDate, "Informe uma data final válida."),
		referenceDate: z.string(),
	})
	.superRefine((values, context) => {
		if (
			isCivilDate(values.startDate) &&
			isCivilDate(values.endDate) &&
			values.startDate > values.endDate
		) {
			context.addIssue({
				code: "custom",
				message: "A data final deve ser igual ou posterior à inicial.",
				path: ["endDate"],
			});
		}
		if (
			isCivilDate(values.startDate) &&
			isCivilDate(values.endDate) &&
			values.startDate <= values.endDate &&
			!inclusivePeriodToTechnical(values)
		) {
			context.addIssue({
				code: "custom",
				message: "Escolha uma data final anterior a 31/12/9999.",
				path: ["endDate"],
			});
		}
	});

type PeriodFilterValues = z.infer<typeof periodFilterSchema>;

export function DashboardPeriodFilter({
	onPeriodChange,
}: {
	onPeriodChange: (period: TechnicalCivilPeriod) => void;
}) {
	const initialMonth = currentSaoPauloMonth();
	const form = useForm<PeriodFilterValues>({
		resolver: zodResolver(periodFilterSchema),
		defaultValues: {
			...initialMonth,
			referenceDate: saoPauloToday(),
		},
	});
	const applyPeriod = (values: PeriodFilterValues) => {
		const period = inclusivePeriodToTechnical(values);
		if (period) onPeriodChange(period);
	};
	const selectReferenceMonth = () => {
		const referenceDate = form.getValues("referenceDate");
		if (!isCivilDate(referenceDate)) {
			form.setError("referenceDate", {
				message: "Informe uma data de referência válida.",
			});
			return;
		}
		const month = civilMonthFor(referenceDate);
		form.setValue("startDate", month.startDate, { shouldValidate: true });
		form.setValue("endDate", month.endDate, { shouldValidate: true });
		form.clearErrors();
		const period = inclusivePeriodToTechnical(month);
		if (period) onPeriodChange(period);
	};

	return (
		<Card className="mt-5 md:mt-7">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground md:text-lg">
					<CalendarDays aria-hidden="true" />
					Período do dashboard
				</CardTitle>
				<CardDescription>
					Escolha as datas inicial e final, ambas inclusivas.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
					onSubmit={form.handleSubmit(applyPeriod)}
				>
					<Field data-invalid={Boolean(form.formState.errors.startDate)}>
						<FieldLabel htmlFor="dashboard-start-date">Data inicial</FieldLabel>
						<Input
							aria-invalid={Boolean(form.formState.errors.startDate)}
							id="dashboard-start-date"
							type="date"
							{...form.register("startDate")}
						/>
						<FieldError errors={[form.formState.errors.startDate]} />
					</Field>
					<Field data-invalid={Boolean(form.formState.errors.endDate)}>
						<FieldLabel htmlFor="dashboard-end-date">Data final</FieldLabel>
						<Input
							aria-invalid={Boolean(form.formState.errors.endDate)}
							id="dashboard-end-date"
							type="date"
							{...form.register("endDate")}
						/>
						<FieldError errors={[form.formState.errors.endDate]} />
					</Field>
					<Button className="w-full lg:w-auto" type="submit">
						Aplicar intervalo
					</Button>
				</form>

				<div className="mt-5 border-border border-t pt-4">
					<p className="mb-3 text-xs font-medium text-foreground">
						Atalho para mês de referência
					</p>
					<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
						<Field data-invalid={Boolean(form.formState.errors.referenceDate)}>
							<FieldLabel htmlFor="dashboard-reference-date">
								Data de referência
							</FieldLabel>
							<Input
								aria-invalid={Boolean(form.formState.errors.referenceDate)}
								id="dashboard-reference-date"
								type="date"
								{...form.register("referenceDate")}
							/>
							<FieldError errors={[form.formState.errors.referenceDate]} />
						</Field>
						<Button
							className="w-full sm:w-auto"
							onClick={selectReferenceMonth}
							type="button"
							variant="outline"
						>
							Selecionar mês completo
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
