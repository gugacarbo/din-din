import { zodResolver } from "@hookform/resolvers/zod";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ArchiveRestore,
	ArrowLeft,
	CircleAlert,
	Pencil,
	Plus,
	RotateCcw,
	Settings2,
	Trash2,
} from "lucide-react";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Cell, Pie, PieChart } from "recharts";
import { z } from "zod";

import { DrawerAwareForm } from "#/components/drawer-aware-form.tsx";
import { ResizableDrawer } from "#/components/resizable-drawer.tsx";
import { Alert, AlertDescription } from "#/components/ui/alert.tsx";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	formatMoneyInputFromCents,
	MoneyInput,
	moneyInputToCents,
} from "#/components/ui/money-input.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import { useOnlineStatus } from "#/hooks/use-online-status.ts";
import { authClient } from "#/lib/auth-client.ts";
import {
	CATEGORY_COLORS,
	CATEGORY_ICONS,
	saoPauloToday,
} from "#/lib/finance.ts";
import {
	categoriesQueryOptions,
	dashboardQueryOptions,
	financeQueryKey,
	invoicesQueryOptions,
	paymentMethodsQueryOptions,
	reportQueryOptions,
	sessionQueryOptions,
	transactionsQueryOptions,
} from "#/lib/finance-query-options.ts";
import { clearNavigationCache } from "#/lib/pwa.ts";
import { cn } from "#/lib/utils.ts";
import type {
	CategoryDto,
	PaymentMethodDto,
	TransactionDto,
} from "#/server/finance.ts";
import {
	archiveCategory,
	archivePaymentMethod,
	archiveTransaction,
	createCategory,
	createPaymentMethod,
	createTransaction,
	restoreCategory,
	restorePaymentMethod,
	restoreTransaction,
	updateCategory,
	updatePaymentMethod,
	updateTransaction,
} from "#/server/finance.ts";

import { AppShell } from "./app-shell.tsx";
import { CategorySelect } from "./category-select.tsx";
import { ColorSelect } from "./color-select.tsx";
import { IconSelect } from "./icon-select.tsx";
import { type Kind, KindSelect } from "./kind-select.tsx";
import { CategoryMark } from "./presentation.tsx";
import { TransactionDetailsDialog } from "./transaction-details-dialog.tsx";

type FinancePageKind =
	| "dashboard"
	| "transactions"
	| "reports"
	| "settings"
	| "categories"
	| "payments"
	| "profile"
	| "archive";

const transactionFormSchema = z.object({
	paymentMethodId: z.string(),
	type: z.enum(["income", "expense"], {
		error: "Escolha o tipo do lançamento antes de salvar.",
	}),
	categoryId: z.string().min(1, "Escolha uma categoria."),
	amount: z.string().refine((value) => {
		const amountCents = moneyInputToCents(value);
		return Number.isSafeInteger(amountCents) && amountCents > 0;
	}, "Informe um valor maior que zero."),
	occurredAt: z.string().min(1, "Informe a data do lançamento."),
	description: z.string().max(280, "Use no máximo 280 caracteres."),
});
type TransactionFormInput = z.input<typeof transactionFormSchema>;
type TransactionFormValues = z.output<typeof transactionFormSchema>;

const categoryFormSchema = z.object({
	parentCategoryId: z.string(),
	type: z.enum(["income", "expense"]),
	name: z
		.string()
		.trim()
		.min(1, "Informe o nome da categoria.")
		.max(40, "Use no máximo 40 caracteres."),
	colorKey: z.enum(CATEGORY_COLORS),
	iconKey: z.enum(CATEGORY_ICONS),
});
type CategoryFormInput = z.input<typeof categoryFormSchema>;
type CategoryFormValues = z.output<typeof categoryFormSchema>;

const paymentMethodKinds = [
	"credit_card",
	"debit_card",
	"pix",
	"cash",
	"bank_transfer",
	"boleto",
	"other",
] as const;
const paymentMethodFormSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, "Informe o nome da forma de pagamento.")
			.max(80, "Use no máximo 80 caracteres."),
		kind: z.enum(paymentMethodKinds),
		colorKey: z.enum(CATEGORY_COLORS),
		iconKey: z.enum(CATEGORY_ICONS),
		invoiceControl: z.boolean(),
		closingDay: z.string(),
		dueDay: z.string(),
	})
	.superRefine((values, context) => {
		if (values.kind !== "credit_card" || !values.invoiceControl) return;
		for (const [field, label] of [
			["closingDay", "fechamento"],
			["dueDay", "vencimento"],
		] as const) {
			const day = Number(values[field]);
			if (!Number.isInteger(day) || day < 1 || day > 31) {
				context.addIssue({
					code: "custom",
					message: `Informe um dia de ${label} entre 1 e 31.`,
					path: [field],
				});
			}
		}
	});
type PaymentMethodFormInput = z.input<typeof paymentMethodFormSchema>;
type PaymentMethodFormValues = z.output<typeof paymentMethodFormSchema>;

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});
const moneyFromCents = (value: number) => money.format(value / 100);
const kindLabel = (kind: Kind) => (kind === "income" ? "Receita" : "Despesa");
const errorMessage = (cause: unknown) =>
	cause instanceof Error
		? cause.message
		: "Não foi possível carregar os dados.";

function Notice({ children }: { children: React.ReactNode }) {
	return (
		<Alert className="mt-3" variant="destructive">
			<CircleAlert />
			<AlertDescription>{children}</AlertDescription>
		</Alert>
	);
}
function Loading() {
	return (
		<div aria-label="Carregando" className="space-y-3 py-6" role="status">
			<Skeleton className="h-5 w-1/3" />
			<Skeleton className="h-16 w-full" />
			<Skeleton className="h-16 w-full" />
			<span className="sr-only">Carregando…</span>
		</div>
	);
}

function FinanceCard({ className, ...props }: ComponentProps<typeof Card>) {
	return (
		<Card
			className={cn("island-shell rounded-2xl py-0 shadow-none", className)}
			{...props}
		/>
	);
}

function ArchiveConfirmation({
	open,
	itemName,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	itemName: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Arquivar {itemName}?</AlertDialogTitle>
					<AlertDialogDescription>
						O item sairá das listas ativas, mas poderá ser restaurado pelo
						arquivo.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancelar</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						Arquivar
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function PageTitle({
	eyebrow,
	title,
	children,
	compact = false,
}: {
	eyebrow: string;
	title: string;
	children?: React.ReactNode;
	compact?: boolean;
}) {
	return (
		<header
			className={cn(
				"flex flex-wrap items-end justify-between",
				compact ? "mb-5 gap-3" : "mb-7 gap-4",
			)}
		>
			<div>
				<p className="island-kicker">{eyebrow}</p>
				<h1
					className={cn(
						"mt-1 font-semibold text-foreground",
						compact ? "text-3xl md:text-4xl" : "text-4xl",
					)}
				>
					{title}
				</h1>
			</div>
			{children}
		</header>
	);
}

function TransactionRows({
	items,
	onEdit,
	onArchive,
	onRestore,
	onView,
}: {
	items: TransactionDto[];
	onEdit?: (item: TransactionDto) => void;
	onArchive?: (item: TransactionDto) => void;
	onRestore?: (item: TransactionDto) => void;
	onView?: (item: TransactionDto) => void;
}) {
	if (!items.length)
		return (
			<p className="py-8 text-sm text-muted-foreground">
				Nenhum lançamento por aqui.
			</p>
		);
	return (
		<ul className="divide-y divide-border">
			{items.map((item) => (
				<li className="flex items-center gap-3 py-3" key={item.id}>
					<Button
						aria-label={`Ver lançamento ${item.category.name}`}
						className="h-auto min-w-0 flex-1 justify-start gap-3 p-0 text-left"
						onClick={() => onView?.(item)}
						type="button"
						variant="ghost"
					>
						<CategoryMark
							colorKey={item.category.colorKey}
							iconKey={item.category.iconKey}
						/>
						<div className="min-w-0 flex-1">
							<p className="font-semibold text-foreground">
								{item.category.name}
							</p>
							<p className="truncate text-xs text-muted-foreground">
								{item.occurredAt}
								{item.description ? ` · ${item.description}` : ""}
							</p>
						</div>
						<p
							className={
								item.type === "income"
									? "font-bold text-income"
									: "font-bold text-expense"
							}
						>
							{item.type === "income" ? "+" : "−"}
							{moneyFromCents(item.amountCents)}
						</p>
					</Button>
					{onEdit && (
						<Button
							aria-label="Editar lançamento"
							onClick={() => onEdit(item)}
							size="icon"
							variant="ghost"
						>
							<Pencil />
						</Button>
					)}
					{onArchive && (
						<Button
							aria-label="Arquivar lançamento"
							onClick={() => onArchive(item)}
							size="icon"
							variant="ghost"
						>
							<Trash2 />
						</Button>
					)}
					{onRestore && (
						<Button
							aria-label="Restaurar lançamento"
							onClick={() => onRestore(item)}
							size="icon"
							variant="ghost"
						>
							<RotateCcw />
						</Button>
					)}
				</li>
			))}
		</ul>
	);
}

function Dashboard({ onView }: { onView: (item: TransactionDto) => void }) {
	const result = useQuery(dashboardQueryOptions());
	if (result.isPending) return <Loading />;
	if (result.error || !result.data)
		return <Notice>{errorMessage(result.error)}</Notice>;
	const { month, recentTransactions, incomeByPaymentMethod } = result.data;
	return (
		<>
			<PageTitle compact eyebrow="visão geral" title="Seu mês em movimento" />
			<section className="grid grid-cols-3 gap-2 md:gap-4">
				<Summary
					compact
					label="Entradas"
					value={month.incomeCents}
					tone="income"
				/>
				<Summary
					compact
					label="Saídas"
					value={month.expenseCents}
					tone="expense"
				/>
				<Summary
					compact
					label="Saldo"
					value={month.balanceCents}
					tone="balance"
				/>
			</section>
			<Card className="mt-5 md:mt-7">
				<CardHeader>
					<CardTitle className="text-xl font-semibold text-foreground md:text-2xl">
						De onde vieram as entradas
					</CardTitle>
				</CardHeader>
				<CardContent>
					<ul className="divide-y divide-border">
						{incomeByPaymentMethod.map((item) => (
							<li
								className="flex justify-between py-2"
								key={item.paymentMethodId ?? "none"}
							>
								<span className="text-foreground">{item.name}</span>
								<strong className="text-foreground">
									{moneyFromCents(item.amountCents)}
								</strong>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>
			<Card className="mt-5 md:mt-7">
				<CardHeader>
					<CardTitle className="text-xl font-semibold text-foreground md:text-2xl">
						Últimos lançamentos
					</CardTitle>
					<CardAction>
						<Button
							asChild
							className="h-auto p-0 font-bold text-foreground hover:text-foreground"
							variant="link"
						>
							<Link to="/transactions">Ver histórico</Link>
						</Button>
					</CardAction>
				</CardHeader>
				<CardContent>
					<TransactionRows items={recentTransactions} onView={onView} />
				</CardContent>
			</Card>
		</>
	);
}

function Summary({
	label,
	value,
	tone,
	compact = false,
}: {
	label: string;
	value: number;
	tone: "income" | "expense" | "balance";
	compact?: boolean;
}) {
	const className =
		tone === "income"
			? "text-income"
			: tone === "expense"
				? "text-expense"
				: "text-foreground";
	return (
		<Card size={compact ? "sm" : "default"}>
			<CardHeader>
				<CardDescription className="font-medium tracking-widest uppercase">
					{label}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<p
					className={cn(
						"font-semibold",
						compact ? "text-lg md:text-2xl" : "text-2xl",
						className,
					)}
				>
					{moneyFromCents(value)}
				</p>
			</CardContent>
		</Card>
	);
}

function TransactionForm({
	initial,
	mobileDrawer = false,
	onSaved,
	onCancel,
}: {
	initial?: TransactionDto;
	mobileDrawer?: boolean;
	onSaved: () => void;
	onCancel?: () => void;
}) {
	const form = useForm<TransactionFormInput, unknown, TransactionFormValues>({
		defaultValues: {
			paymentMethodId: initial?.paymentMethodId ?? "",
			type: initial?.type,
			categoryId: initial?.categoryId ?? "",
			amount: initial ? formatMoneyInputFromCents(initial.amountCents) : "0,00",
			occurredAt: initial?.occurredAt ?? saoPauloToday(),
			description: initial?.description ?? "",
		},
		resolver: zodResolver(transactionFormSchema),
	});
	const type = form.watch("type");
	const categoriesResult = useQuery(categoriesQueryOptions("active"));
	const paymentMethodsResult = useQuery(paymentMethodsQueryOptions());
	const [submitError, setSubmitError] = useState<string | null>(null);
	const saveTransaction = useMutation({
		mutationFn: async (values: TransactionFormValues) => {
			const data = {
				type: values.type,
				categoryId: values.categoryId,
				amountCents: moneyInputToCents(values.amount),
				occurredAt: values.occurredAt,
				description: values.description || null,
				paymentMethodId: values.paymentMethodId || null,
			};
			if (initial)
				return updateTransaction({ data: { ...data, id: initial.id } });
			return createTransaction({ data });
		},
	});
	const choices = useMemo(
		() =>
			categoriesResult.data?.filter((category) => category.type === type) ?? [],
		[categoriesResult.data, type],
	);
	const paymentChoices = useMemo(() => {
		const methods = paymentMethodsResult.data ?? [];
		return methods.filter(
			(method: PaymentMethodDto) =>
				method.archivedAt === null || method.id === initial?.paymentMethodId,
		);
	}, [paymentMethodsResult.data, initial?.paymentMethodId]);
	useEffect(() => {
		if (
			!choices.some((category) => category.id === form.getValues("categoryId"))
		)
			form.setValue("categoryId", choices[0]?.id ?? "", {
				shouldValidate: form.formState.isSubmitted,
			});
	}, [choices, form]);
	async function submit(values: TransactionFormValues) {
		setSubmitError(null);
		try {
			await saveTransaction.mutateAsync(values);
			onSaved();
		} catch (cause) {
			setSubmitError(
				cause instanceof Error ? cause.message : "Não foi possível salvar.",
			);
		}
	}
	const submitDisabled =
		form.formState.isSubmitting || categoriesResult.isPending;
	const submitLabel = form.formState.isSubmitting
		? "Salvando…"
		: initial
			? "Salvar alterações"
			: "Adicionar lançamento";
	const actions = (
		<>
			<Button
				className={mobileDrawer ? "h-12 w-full" : undefined}
				onClick={onCancel}
				type="button"
				variant="outline"
			>
				Cancelar
			</Button>
			<Button
				className={mobileDrawer ? "h-12 w-full" : undefined}
				disabled={submitDisabled}
				type="submit"
			>
				{submitLabel}
			</Button>
		</>
	);
	return (
		<DrawerAwareForm
			actions={actions}
			mobileDrawer={mobileDrawer}
			noValidate
			onSubmit={form.handleSubmit(submit)}
		>
			<Controller
				control={form.control}
				name="paymentMethodId"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-payment-method">
							Forma de pagamento (opcional)
						</FieldLabel>
						<Select
							onValueChange={(value) =>
								field.onChange(value === "none" ? "" : value)
							}
							value={field.value || "none"}
						>
							<SelectTrigger
								aria-invalid={fieldState.invalid}
								className="w-full"
								id="transaction-payment-method"
							>
								<SelectValue placeholder="Não informado" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">Não informado</SelectItem>
								{paymentChoices.map((method: PaymentMethodDto) => (
									<SelectItem key={method.id} value={method.id}>
										{method.name}
										{method.archivedAt ? " (arquivada)" : ""}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				control={form.control}
				name="type"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-type">Tipo</FieldLabel>
						<KindSelect
							aria-invalid={fieldState.invalid}
							id="transaction-type"
							onValueChange={field.onChange}
							value={field.value as Kind | undefined}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				control={form.control}
				name="categoryId"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-category">Categoria</FieldLabel>
						<CategorySelect
							aria-invalid={fieldState.invalid}
							categories={choices}
							disabled={!type}
							id="transaction-category"
							onValueChange={field.onChange}
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				control={form.control}
				name="amount"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-amount">Valor (R$)</FieldLabel>
						<MoneyInput
							aria-invalid={fieldState.invalid}
							id="transaction-amount"
							onBlur={field.onBlur}
							onValueChange={field.onChange}
							required
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Field data-invalid={Boolean(form.formState.errors.occurredAt)}>
				<FieldLabel htmlFor="transaction-date">Data</FieldLabel>
				<Input
					aria-invalid={Boolean(form.formState.errors.occurredAt)}
					{...form.register("occurredAt")}
					id="transaction-date"
					required
					type="date"
				/>
				<FieldError errors={[form.formState.errors.occurredAt]} />
			</Field>
			<Field data-invalid={Boolean(form.formState.errors.description)}>
				<FieldLabel htmlFor="transaction-description">
					Descrição opcional
				</FieldLabel>
				<Textarea
					aria-invalid={Boolean(form.formState.errors.description)}
					{...form.register("description")}
					className="min-h-18"
					id="transaction-description"
					maxLength={280}
					rows={2}
				/>
				<FieldError errors={[form.formState.errors.description]} />
			</Field>
			{submitError && <Notice>{submitError}</Notice>}
		</DrawerAwareForm>
	);
}

function TransactionDialog({
	editing,
	onOpenChange,
	onSaved,
}: {
	editing: TransactionDto | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const isMobile = useIsMobile();
	const isEdit = Boolean(editing?.id);
	const title = isEdit ? "Editar lançamento" : "Novo lançamento";
	const description = isEdit
		? "Ajuste os dados do lançamento abaixo."
		: "Preencha os dados para criar um novo lançamento.";
	const form = editing && (
		<TransactionForm
			initial={isEdit ? editing : undefined}
			mobileDrawer={isMobile}
			onCancel={() => onOpenChange(false)}
			onSaved={() => {
				onOpenChange(false);
				onSaved();
			}}
		/>
	);
	const onSheetOpenChange = (open: boolean) => {
		if (!open) onOpenChange(false);
	};

	if (isMobile)
		return (
			<ResizableDrawer
				className="pb-0"
				description={description}
				onOpenChange={onSheetOpenChange}
				open={Boolean(editing)}
				title={title}
			>
				{form}
			</ResizableDrawer>
		);

	return (
		<Dialog onOpenChange={onSheetOpenChange} open={Boolean(editing)}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{form}
			</DialogContent>
		</Dialog>
	);
}

function Transactions({
	onEdit,
	onView,
}: {
	onEdit: (item: TransactionDto) => void;
	onView: (item: TransactionDto) => void;
}) {
	const queryClient = useQueryClient();
	const [archiving, setArchiving] = useState<TransactionDto | null>(null);
	const result = useInfiniteQuery(transactionsQueryOptions("active"));
	const archiveMutation = useMutation({
		mutationFn: (id: string) => archiveTransaction({ data: { id } }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: financeQueryKey }),
	});
	async function archive() {
		if (!archiving) return;
		await archiveMutation.mutateAsync(archiving.id);
		setArchiving(null);
	}
	const transactions = result.data?.pages.flatMap((page) => page.items) ?? [];
	return (
		<>
			<PageTitle eyebrow="histórico" title="Lançamentos">
				<Button asChild variant="outline">
					<Link to="/transactions/archive">
						<ArchiveRestore /> Arquivo
					</Link>
				</Button>
			</PageTitle>
			<ArchiveConfirmation
				itemName={archiving?.category.name ?? "este lançamento"}
				onConfirm={() => void archive()}
				onOpenChange={(open) => {
					if (!open) setArchiving(null);
				}}
				open={Boolean(archiving)}
			/>
			{result.isPending ? (
				<Loading />
			) : result.error || !result.data ? (
				<Notice>{errorMessage(result.error)}</Notice>
			) : (
				<FinanceCard className="p-5">
					<TransactionRows
						items={transactions}
						onArchive={setArchiving}
						onEdit={onEdit}
						onView={onView}
					/>
					{result.hasNextPage && (
						<Button
							className="mt-4"
							disabled={result.isFetchingNextPage}
							onClick={() => void result.fetchNextPage()}
							variant="outline"
						>
							{result.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
						</Button>
					)}
				</FinanceCard>
			)}
		</>
	);
}

function CategoryForm({
	initial,
	mobileDrawer = false,
	onSaved,
	onCancel,
}: {
	initial?: CategoryDto;
	mobileDrawer?: boolean;
	onSaved: () => void;
	onCancel?: () => void;
}) {
	const form = useForm<CategoryFormInput, unknown, CategoryFormValues>({
		defaultValues: {
			parentCategoryId: initial?.parentCategoryId ?? "root",
			type: initial?.type ?? "expense",
			name: initial?.name ?? "",
			colorKey:
				(initial?.colorKey as (typeof CATEGORY_COLORS)[number]) ??
				CATEGORY_COLORS[0],
			iconKey:
				(initial?.iconKey as (typeof CATEGORY_ICONS)[number]) ??
				CATEGORY_ICONS[0],
		},
		resolver: zodResolver(categoryFormSchema),
	});
	const type = form.watch("type");
	const categoriesResult = useQuery(categoriesQueryOptions("active"));
	const parentChoices = useMemo(
		() =>
			(categoriesResult.data ?? []).filter(
				(category) =>
					category.type === type &&
					category.id !== initial?.id &&
					category.level < 3,
			),
		[categoriesResult.data, type, initial?.id],
	);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const saveCategory = useMutation({
		mutationFn: async (values: CategoryFormValues) => {
			const data = {
				name: values.name,
				colorKey: values.colorKey,
				iconKey: values.iconKey,
				parentCategoryId:
					values.parentCategoryId === "root" ? null : values.parentCategoryId,
			};
			if (initial) return updateCategory({ data: { id: initial.id, ...data } });
			return createCategory({ data: { ...data, type: values.type } });
		},
	});
	async function submit(values: CategoryFormValues) {
		setSubmitError(null);
		try {
			await saveCategory.mutateAsync(values);
			onSaved();
		} catch (cause) {
			setSubmitError(
				cause instanceof Error ? cause.message : "Não foi possível salvar.",
			);
		}
	}
	const submitLabel = form.formState.isSubmitting
		? "Salvando…"
		: initial
			? "Salvar alterações"
			: "Criar categoria";
	const actions = (
		<>
			<Button
				className={mobileDrawer ? "h-12 w-full" : undefined}
				onClick={onCancel}
				type="button"
				variant="outline"
			>
				Cancelar
			</Button>
			<Button
				className={mobileDrawer ? "h-12 w-full" : undefined}
				disabled={form.formState.isSubmitting}
				type="submit"
			>
				{submitLabel}
			</Button>
		</>
	);
	return (
		<DrawerAwareForm
			actions={actions}
			mobileDrawer={mobileDrawer}
			noValidate
			onSubmit={form.handleSubmit(submit)}
		>
			<Controller
				control={form.control}
				name="parentCategoryId"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="category-parent">
							Categoria pai (opcional)
						</FieldLabel>
						<CategorySelect
							aria-invalid={fieldState.invalid}
							categories={parentChoices}
							id="category-parent"
							onValueChange={field.onChange}
							placeholder="Categoria raiz"
							rootOption={{ label: "Categoria raiz", value: "root" }}
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				control={form.control}
				name="type"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="category-type">Tipo</FieldLabel>
						<KindSelect
							aria-invalid={fieldState.invalid}
							disabled={Boolean(initial)}
							id="category-type"
							onValueChange={field.onChange}
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Field data-invalid={Boolean(form.formState.errors.name)}>
				<FieldLabel htmlFor="category-name">Nome</FieldLabel>
				<Input
					aria-invalid={Boolean(form.formState.errors.name)}
					{...form.register("name")}
					id="category-name"
					maxLength={40}
					required
				/>
				<FieldError errors={[form.formState.errors.name]} />
			</Field>
			<Controller
				control={form.control}
				name="colorKey"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="category-color">Cor</FieldLabel>
						<ColorSelect
							id="category-color"
							onValueChange={field.onChange}
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				control={form.control}
				name="iconKey"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="category-icon">Ícone</FieldLabel>
						<IconSelect
							id="category-icon"
							onValueChange={field.onChange}
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			{submitError && <Notice>{submitError}</Notice>}
		</DrawerAwareForm>
	);
}

function CategoryDialog({
	editing,
	onOpenChange,
	onSaved,
}: {
	editing: CategoryDto | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const isMobile = useIsMobile();
	const isEdit = Boolean(editing?.id);
	const title = isEdit ? "Editar categoria" : "Nova categoria";
	const description = isEdit
		? "Ajuste os dados da categoria abaixo."
		: "Preencha os dados para criar uma nova categoria.";
	const form = editing && (
		<CategoryForm
			initial={isEdit ? editing : undefined}
			mobileDrawer={isMobile}
			onCancel={() => onOpenChange(false)}
			onSaved={() => {
				onOpenChange(false);
				onSaved();
			}}
		/>
	);
	const onDialogOpenChange = (open: boolean) => {
		if (!open) onOpenChange(false);
	};

	if (isMobile)
		return (
			<ResizableDrawer
				className="pb-0"
				description={description}
				onOpenChange={onDialogOpenChange}
				open={Boolean(editing)}
				title={title}
			>
				{form}
			</ResizableDrawer>
		);

	return (
		<Dialog onOpenChange={onDialogOpenChange} open={Boolean(editing)}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{form}
			</DialogContent>
		</Dialog>
	);
}

function Categories() {
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<"active" | "archived">("active");
	const [editing, setEditing] = useState<CategoryDto | null>(null);
	const [archiving, setArchiving] = useState<CategoryDto | null>(null);
	const result = useQuery(categoriesQueryOptions(status));
	const archiveMutation = useMutation({
		mutationFn: (id: string) => archiveCategory({ data: { id } }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: financeQueryKey }),
	});
	const restoreMutation = useMutation({
		mutationFn: (id: string) => restoreCategory({ data: { id } }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: financeQueryKey }),
	});
	async function archive() {
		if (!archiving) return;
		await archiveMutation.mutateAsync(archiving.id);
		setArchiving(null);
	}
	async function restore(category: CategoryDto) {
		await restoreMutation.mutateAsync(category.id);
	}
	return (
		<>
			<PageTitle eyebrow="organização" title="Categorias">
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link to="/profile">
							<ArrowLeft />
							Voltar
						</Link>
					</Button>
					<Button onClick={() => setEditing({} as CategoryDto)}>
						<Plus /> Nova
					</Button>
				</div>
			</PageTitle>
			<CategoryDialog
				editing={editing}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onSaved={() => {
					void queryClient.invalidateQueries({ queryKey: financeQueryKey });
				}}
			/>
			<ArchiveConfirmation
				itemName={archiving?.name ?? "esta categoria"}
				onConfirm={() => void archive()}
				onOpenChange={(open) => {
					if (!open) setArchiving(null);
				}}
				open={Boolean(archiving)}
			/>
			<Tabs
				className="mb-4"
				onValueChange={(value) => setStatus(value as typeof status)}
				value={status}
			>
				<TabsList>
					<TabsTrigger value="active">Ativas</TabsTrigger>
					<TabsTrigger value="archived">Arquivadas</TabsTrigger>
				</TabsList>
			</Tabs>
			{result.isPending ? (
				<Loading />
			) : result.error || !result.data ? (
				<Notice>{errorMessage(result.error)}</Notice>
			) : (
				<FinanceCard className="p-5">
					<ul className="divide-y divide-border">
						{result.data.map((category) => (
							<li className="flex items-center gap-3 py-3" key={category.id}>
								<CategoryMark
									colorKey={category.colorKey}
									iconKey={category.iconKey}
								/>
								<div className="flex-1">
									<p className="font-semibold">
										{"— ".repeat(category.level - 1)}
										{category.name}
									</p>
									<p className="text-xs text-muted-foreground">
										{kindLabel(category.type)}
									</p>
								</div>
								{status === "active" && (
									<Button
										aria-label="Editar categoria"
										onClick={() => setEditing(category)}
										size="icon"
										variant="ghost"
									>
										<Pencil />
									</Button>
								)}
								<Button
									aria-label={
										status === "active"
											? "Arquivar categoria"
											: "Restaurar categoria"
									}
									onClick={() =>
										status === "active"
											? setArchiving(category)
											: void restore(category)
									}
									size="icon"
									variant="ghost"
								>
									{status === "active" ? <Trash2 /> : <RotateCcw />}
								</Button>
							</li>
						))}
					</ul>
				</FinanceCard>
			)}
		</>
	);
}

function PaymentMethodForm({
	initial,
	mobileDrawer = false,
	onSaved,
	onCancel,
}: {
	initial?: PaymentMethodDto;
	mobileDrawer?: boolean;
	onSaved: () => void;
	onCancel: () => void;
}) {
	const form = useForm<
		PaymentMethodFormInput,
		unknown,
		PaymentMethodFormValues
	>({
		defaultValues: {
			name: initial?.name ?? "",
			kind: initial?.kind ?? "credit_card",
			colorKey:
				(initial?.colorKey as (typeof CATEGORY_COLORS)[number]) ??
				CATEGORY_COLORS[0],
			iconKey:
				(initial?.iconKey as (typeof CATEGORY_ICONS)[number]) ?? "CreditCard",
			invoiceControl: initial?.invoiceControl ?? false,
			closingDay: initial?.closingDay ? String(initial.closingDay) : "",
			dueDay: initial?.dueDay ? String(initial.dueDay) : "",
		},
		resolver: zodResolver(paymentMethodFormSchema),
	});
	const kind = form.watch("kind");
	const invoiceControl = form.watch("invoiceControl");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const canInvoice = kind === "credit_card" && invoiceControl;
	const savePaymentMethod = useMutation({
		mutationFn: async (values: PaymentMethodFormValues) => {
			const usesInvoices =
				values.kind === "credit_card" && values.invoiceControl;
			const data = {
				name: values.name,
				kind: values.kind,
				colorKey: values.colorKey,
				iconKey: values.iconKey,
				invoiceControl: usesInvoices,
				closingDay: usesInvoices ? Number(values.closingDay) : null,
				dueDay: usesInvoices ? Number(values.dueDay) : null,
			};
			if (initial)
				return updatePaymentMethod({ data: { id: initial.id, ...data } });
			return createPaymentMethod({ data });
		},
	});
	async function submit(values: PaymentMethodFormValues) {
		setSubmitError(null);
		try {
			await savePaymentMethod.mutateAsync(values);
			onSaved();
		} catch (cause) {
			setSubmitError(
				cause instanceof Error ? cause.message : "Não foi possível salvar.",
			);
		}
	}
	const actions = (
		<>
			<Button
				className={mobileDrawer ? "h-12 w-full" : undefined}
				onClick={onCancel}
				type="button"
				variant="outline"
			>
				Cancelar
			</Button>
			<Button
				className={mobileDrawer ? "h-12 w-full" : undefined}
				disabled={form.formState.isSubmitting}
				type="submit"
			>
				{form.formState.isSubmitting ? "Salvando…" : "Salvar forma"}
			</Button>
		</>
	);
	return (
		<DrawerAwareForm
			actions={actions}
			mobileDrawer={mobileDrawer}
			noValidate
			onSubmit={form.handleSubmit(submit)}
		>
			<Field data-invalid={Boolean(form.formState.errors.name)}>
				<FieldLabel htmlFor="payment-name">Nome</FieldLabel>
				<Input
					aria-invalid={Boolean(form.formState.errors.name)}
					{...form.register("name")}
					id="payment-name"
					maxLength={80}
					required
				/>
				<FieldError errors={[form.formState.errors.name]} />
			</Field>
			<Controller
				control={form.control}
				name="kind"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="payment-kind">Tipo</FieldLabel>
						<Select onValueChange={field.onChange} value={field.value}>
							<SelectTrigger
								aria-invalid={fieldState.invalid}
								className="w-full"
								id="payment-kind"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="credit_card">Cartão de crédito</SelectItem>
								<SelectItem value="debit_card">Cartão de débito</SelectItem>
								<SelectItem value="pix">Pix</SelectItem>
								<SelectItem value="cash">Dinheiro</SelectItem>
								<SelectItem value="bank_transfer">Transferência</SelectItem>
								<SelectItem value="boleto">Boleto</SelectItem>
								<SelectItem value="other">Outro</SelectItem>
							</SelectContent>
						</Select>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				control={form.control}
				name="colorKey"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="payment-color">Cor</FieldLabel>
						<ColorSelect
							id="payment-color"
							onValueChange={field.onChange}
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Controller
				control={form.control}
				name="iconKey"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="payment-icon">Ícone</FieldLabel>
						<IconSelect
							id="payment-icon"
							onValueChange={field.onChange}
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			{kind === "credit_card" && (
				<Controller
					control={form.control}
					name="invoiceControl"
					render={({ field, fieldState }) => (
						<Field
							className="flex-row items-center gap-2"
							data-invalid={fieldState.invalid}
						>
							<Switch
								aria-invalid={fieldState.invalid}
								checked={field.value}
								id="payment-invoice-control"
								onCheckedChange={field.onChange}
							/>
							<FieldLabel htmlFor="payment-invoice-control">
								Controlar faturas
							</FieldLabel>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>
			)}
			{canInvoice && (
				<div className="grid grid-cols-2 gap-3">
					<Field data-invalid={Boolean(form.formState.errors.closingDay)}>
						<FieldLabel htmlFor="payment-closing-day">Fechamento</FieldLabel>
						<Input
							aria-invalid={Boolean(form.formState.errors.closingDay)}
							{...form.register("closingDay")}
							id="payment-closing-day"
							max="31"
							min="1"
							required
							type="number"
						/>
						<FieldError errors={[form.formState.errors.closingDay]} />
					</Field>
					<Field data-invalid={Boolean(form.formState.errors.dueDay)}>
						<FieldLabel htmlFor="payment-due-day">Vencimento</FieldLabel>
						<Input
							aria-invalid={Boolean(form.formState.errors.dueDay)}
							{...form.register("dueDay")}
							id="payment-due-day"
							max="31"
							min="1"
							required
							type="number"
						/>
						<FieldError errors={[form.formState.errors.dueDay]} />
					</Field>
				</div>
			)}
			{submitError && <Notice>{submitError}</Notice>}
		</DrawerAwareForm>
	);
}

function PaymentMethodDialog({
	editing,
	onOpenChange,
	onSaved,
}: {
	editing: PaymentMethodDto | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const isMobile = useIsMobile();
	const isEdit = Boolean(editing?.id);
	const title = isEdit ? "Editar forma" : "Nova forma de pagamento";
	const description =
		"Vincule receitas e despesas a este meio. A configuração de fatura é opcional.";
	const form = editing && (
		<PaymentMethodForm
			initial={isEdit ? editing : undefined}
			mobileDrawer={isMobile}
			onCancel={() => onOpenChange(false)}
			onSaved={onSaved}
		/>
	);
	const onDialogOpenChange = (open: boolean) => {
		if (!open) onOpenChange(false);
	};

	if (isMobile)
		return (
			<ResizableDrawer
				className="pb-0"
				description={description}
				onOpenChange={onDialogOpenChange}
				open={Boolean(editing)}
				title={title}
			>
				{form}
			</ResizableDrawer>
		);

	return (
		<Dialog onOpenChange={onDialogOpenChange} open={Boolean(editing)}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{form}
			</DialogContent>
		</Dialog>
	);
}

function Payments() {
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<"methods" | "invoices">("methods");
	const [editing, setEditing] = useState<PaymentMethodDto | null>(null);
	const methods = useQuery(paymentMethodsQueryOptions());
	const invoices = useQuery(invoicesQueryOptions());
	const archiveMutation = useMutation({
		mutationFn: (id: string) => archivePaymentMethod({ data: { id } }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: financeQueryKey }),
	});
	const restoreMutation = useMutation({
		mutationFn: (id: string) => restorePaymentMethod({ data: { id } }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: financeQueryKey }),
	});
	async function archive(method: PaymentMethodDto) {
		await archiveMutation.mutateAsync(method.id);
	}
	async function restore(method: PaymentMethodDto) {
		await restoreMutation.mutateAsync(method.id);
	}
	return (
		<>
			<PageTitle eyebrow="pagamentos" title="Formas e faturas">
				<div className="flex gap-2">
					<Button asChild variant="outline">
						<Link to="/profile">
							<ArrowLeft />
							Voltar
						</Link>
					</Button>
					<Button onClick={() => setEditing({} as PaymentMethodDto)}>
						<Plus /> Nova forma
					</Button>
				</div>
			</PageTitle>
			<PaymentMethodDialog
				editing={editing}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onSaved={() => {
					setEditing(null);
					void queryClient.invalidateQueries({ queryKey: financeQueryKey });
				}}
			/>
			<Tabs
				className="mb-4"
				onValueChange={(value) => setTab(value as typeof tab)}
				value={tab}
			>
				<TabsList>
					<TabsTrigger value="methods">Formas de pagamento</TabsTrigger>
					<TabsTrigger value="invoices">Faturas</TabsTrigger>
				</TabsList>
			</Tabs>
			{tab === "methods" &&
				(methods.isPending ? (
					<Loading />
				) : methods.error || !methods.data ? (
					<Notice>{errorMessage(methods.error)}</Notice>
				) : (
					<FinanceCard className="p-5">
						<ul className="divide-y divide-border">
							{methods.data.map((method) => (
								<li className="flex items-center gap-3 py-3" key={method.id}>
									<CategoryMark
										colorKey={method.colorKey}
										iconKey={method.iconKey}
									/>
									<div className="min-w-0 flex-1">
										<p className="font-semibold">
											{method.name}
											{method.archivedAt ? " (arquivada)" : ""}
										</p>
										<p className="text-xs text-muted-foreground">
											{method.kind === "credit_card" && method.invoiceControl
												? `Cartão · fecha dia ${method.closingDay} · vence dia ${method.dueDay}`
												: method.kind.replace("_", " ")}
										</p>
									</div>
									{!method.archivedAt && (
										<Button
											aria-label="Editar forma de pagamento"
											onClick={() => setEditing(method)}
											size="icon"
											variant="ghost"
										>
											<Pencil />
										</Button>
									)}
									<Button
										aria-label={
											method.archivedAt
												? "Restaurar forma de pagamento"
												: "Arquivar forma de pagamento"
										}
										onClick={() =>
											void (method.archivedAt
												? restore(method)
												: archive(method))
										}
										size="icon"
										variant="ghost"
									>
										{method.archivedAt ? <RotateCcw /> : <Trash2 />}
									</Button>
								</li>
							))}
						</ul>
					</FinanceCard>
				))}
			{tab === "invoices" &&
				(invoices.isPending ? (
					<Loading />
				) : invoices.error || !invoices.data ? (
					<Notice>{errorMessage(invoices.error)}</Notice>
				) : (
					<div className="grid gap-4">
						{invoices.data.length === 0 ? (
							<FinanceCard className="p-5">
								<p className="text-sm text-muted-foreground">
									Nenhuma fatura derivada no momento.
								</p>
							</FinanceCard>
						) : (
							invoices.data.map((invoice) => (
								<FinanceCard
									className="p-5"
									key={`${invoice.paymentMethodId}-${invoice.cycleClosingDate}-${invoice.cycleDueDate}`}
								>
									<div className="flex justify-between gap-3">
										<div>
											<CardTitle className="font-semibold text-foreground">
												{invoice.paymentMethod.name}
												{invoice.paymentMethod.archivedAt ? " (arquivado)" : ""}
											</CardTitle>
											<p className="text-xs text-muted-foreground">
												Ciclo até {invoice.cycleClosingDate} · vence em{" "}
												{invoice.cycleDueDate}
											</p>
										</div>
										<p className="font-bold">
											{moneyFromCents(invoice.totalCents)}
										</p>
									</div>
									<ul className="mt-3 divide-y divide-border">
										{invoice.items.map((item) => (
											<li
												className="flex justify-between py-2 text-sm"
												key={item.transactionId}
											>
												<span>
													{item.category.name} · {item.occurredAt}
												</span>
												<span>{moneyFromCents(item.amountCents)}</span>
											</li>
										))}
									</ul>
								</FinanceCard>
							))
						)}
					</div>
				))}
		</>
	);
}

function Settings() {
	return (
		<>
			<PageTitle eyebrow="organização" title="Configurações" />
			<SettingsList />
		</>
	);
}

function SettingsList({ onSelect }: { onSelect?: () => void }) {
	return (
		<div className="grid gap-2">
			<Link
				className="rounded-lg border border-border px-4 py-3 font-medium transition-colors hover:bg-muted"
				onClick={onSelect}
				to="/categories"
			>
				Categorias
			</Link>
			<Link
				className="rounded-lg border border-border px-4 py-3 font-medium transition-colors hover:bg-muted"
				onClick={onSelect}
				to="/payments"
			>
				Formas de pagamento
			</Link>
		</div>
	);
}

function SettingsSheet() {
	const [open, setOpen] = useState(false);

	return (
		<Sheet onOpenChange={setOpen} open={open}>
			<Button
				aria-label="Configurações"
				onClick={() => setOpen(true)}
				size="icon"
				variant="outline"
			>
				<Settings2 />
			</Button>
			<SheetContent className="w-80 gap-6 p-6" side="right">
				<SheetHeader className="p-0 pr-10 text-left">
					<SheetTitle>Configurações</SheetTitle>
					<SheetDescription>
						Organize suas categorias e formas de pagamento.
					</SheetDescription>
				</SheetHeader>
				<SettingsList onSelect={() => setOpen(false)} />
			</SheetContent>
		</Sheet>
	);
}

function Profile({
	user,
}: {
	user: { name: string; email: string; image?: string | null } | null;
}) {
	const userName = user?.name || user?.email || "Usuário";
	const userInitial = userName.trim().charAt(0).toUpperCase() || "U";

	return (
		<>
			<PageTitle eyebrow="conta" title="Perfil">
				<SettingsSheet />
			</PageTitle>
			<FinanceCard className="p-5">
				<div className="flex items-center gap-4">
					{user?.image ? (
						<img
							alt=""
							className="size-16 rounded-2xl object-cover"
							src={user.image}
						/>
					) : (
						<span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">
							{userInitial}
						</span>
					)}
					<div className="min-w-0">
						<CardTitle className="truncate text-lg font-semibold text-foreground">
							{userName}
						</CardTitle>
						<p className="truncate text-sm text-muted-foreground">
							{user?.email || "E-mail não disponível"}
						</p>
					</div>
				</div>
			</FinanceCard>
		</>
	);
}

function Archive({ onView }: { onView: (item: TransactionDto) => void }) {
	const queryClient = useQueryClient();
	const result = useInfiniteQuery(transactionsQueryOptions("archived"));
	const restoreMutation = useMutation({
		mutationFn: (id: string) => restoreTransaction({ data: { id } }),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: financeQueryKey }),
	});
	async function restore(item: TransactionDto) {
		await restoreMutation.mutateAsync(item.id);
	}
	const transactions = result.data?.pages.flatMap((page) => page.items) ?? [];
	return (
		<>
			<PageTitle eyebrow="arquivo" title="Lançamentos arquivados">
				<Button asChild variant="outline">
					<Link to="/transactions">
						<ArrowLeft />
						Voltar para lançamentos
					</Link>
				</Button>
			</PageTitle>
			{result.isPending ? (
				<Loading />
			) : result.error || !result.data ? (
				<Notice>{errorMessage(result.error)}</Notice>
			) : (
				<FinanceCard className="p-5">
					<TransactionRows
						items={transactions}
						onRestore={restore}
						onView={onView}
					/>
					{result.hasNextPage && (
						<Button
							className="mt-4"
							disabled={result.isFetchingNextPage}
							onClick={() => void result.fetchNextPage()}
							variant="outline"
						>
							{result.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
						</Button>
					)}
				</FinanceCard>
			)}
		</>
	);
}

type ExpenseCategoryTreeNode = {
	category: CategoryDto;
	directAmountCents: number;
	aggregateAmountCents: number;
	children: ExpenseCategoryTreeNode[];
};

function ExpenseCategoryTree({ nodes }: { nodes: ExpenseCategoryTreeNode[] }) {
	return (
		<ul
			className="mt-3 divide-y divide-border"
			aria-label="Árvore de despesas por categoria"
		>
			{nodes.map((node) => (
				<ExpenseCategoryTreeNodeRow key={node.category.id} node={node} />
			))}
		</ul>
	);
}

function ExpenseCategoryTreeNodeRow({
	node,
	depth = 0,
}: {
	node: ExpenseCategoryTreeNode;
	depth?: number;
}) {
	const [expanded, setExpanded] = useState(true);
	const hasChildren = node.children.length > 0;
	return (
		<li>
			<div
				className="flex items-center gap-3 py-3"
				style={{ paddingLeft: `${depth * 1.25}rem` }}
			>
				{hasChildren ? (
					<Button
						aria-expanded={expanded}
						aria-label={`${expanded ? "Recolher" : "Expandir"} ${node.category.name}`}
						className="text-muted-foreground"
						onClick={() => setExpanded((value) => !value)}
						size="icon-xs"
						type="button"
						variant="ghost"
					>
						{expanded ? "−" : "+"}
					</Button>
				) : (
					<span className="size-6" />
				)}
				<CategoryMark
					colorKey={node.category.colorKey}
					iconKey={node.category.iconKey}
				/>
				<div className="min-w-0 flex-1">
					<p className="font-semibold">{node.category.name}</p>
					<p className="text-xs text-muted-foreground">
						Direto: {moneyFromCents(node.directAmountCents)} · Agregado:{" "}
						{moneyFromCents(node.aggregateAmountCents)}
					</p>
				</div>
				<strong>{moneyFromCents(node.aggregateAmountCents)}</strong>
			</div>
			{hasChildren && expanded && (
				<ul className="border-l border-border">
					{node.children.map((child) => (
						<ExpenseCategoryTreeNodeRow
							depth={depth + 1}
							key={child.category.id}
							node={child}
						/>
					))}
				</ul>
			)}
		</li>
	);
}

function Reports() {
	const [granularity, setGranularity] = useState<"day" | "week" | "month">(
		"month",
	);
	const [anchorDate, setAnchorDate] = useState(saoPauloToday());
	const result = useQuery(reportQueryOptions(granularity, anchorDate));
	const report = result.data;
	const chartColors: Record<string, string> = {
		emerald: "#10b981",
		cyan: "#06b6d4",
		violet: "#8b5cf6",
		blue: "#3b82f6",
		orange: "#f97316",
		amber: "#f59e0b",
		indigo: "#6366f1",
		lime: "#84cc16",
		pink: "#ec4899",
		red: "#ef4444",
		rose: "#f43f5e",
		sky: "#0ea5e9",
		slate: "#64748b",
		teal: "#14b8a6",
		fuchsia: "#d946ef",
	};
	const chartData =
		report?.expenseByCategory.map((item) => ({
			amountCents: item.amountCents,
			category: item.categoryName,
			fill: chartColors[item.colorKey] ?? "#64748b",
		})) ?? [];
	const chartConfig = Object.fromEntries(
		chartData.map((item) => [item.category, { label: item.category }]),
	) satisfies ChartConfig;
	return (
		<>
			<PageTitle eyebrow="relatórios" title="Para onde foi seu dinheiro" />
			<FinanceCard className="mb-6 flex flex-row flex-wrap gap-3 p-4">
				<Select
					onValueChange={(value) => setGranularity(value as typeof granularity)}
					value={granularity}
				>
					<SelectTrigger className="w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="day">Dia</SelectItem>
						<SelectItem value="week">Semana</SelectItem>
						<SelectItem value="month">Mês</SelectItem>
					</SelectContent>
				</Select>
				<Input
					className="w-44"
					onChange={(event) => setAnchorDate(event.target.value)}
					type="date"
					value={anchorDate}
				/>
			</FinanceCard>
			{result.isPending ? (
				<Loading />
			) : result.error || !result.data ? (
				<Notice>{errorMessage(result.error)}</Notice>
			) : (
				<>
					<section className="grid gap-4 md:grid-cols-3">
						<Summary
							label="Entradas"
							tone="income"
							value={result.data.incomeCents}
						/>
						<Summary
							label="Saídas"
							tone="expense"
							value={result.data.expenseCents}
						/>
						<Summary
							label="Saldo"
							tone="balance"
							value={result.data.balanceCents}
						/>
					</section>
					<FinanceCard className="mt-7 grid gap-6 p-5 md:grid-cols-[180px_1fr]">
						<div className="relative mx-auto size-40">
							<ChartContainer
								aria-label="Distribuição de despesas por categoria"
								className="size-40"
								config={chartConfig}
							>
								<PieChart>
									<ChartTooltip
										content={
											<ChartTooltipContent
												formatter={(value) => moneyFromCents(Number(value))}
												nameKey="category"
											/>
										}
									/>
									<Pie
										data={chartData}
										dataKey="amountCents"
										innerRadius={48}
										nameKey="category"
										outerRadius={76}
										strokeWidth={4}
									>
										{chartData.map((item) => (
											<Cell fill={item.fill} key={item.category} />
										))}
									</Pie>
								</PieChart>
							</ChartContainer>
							<div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-xs font-bold text-card-foreground">
								<div>
									{moneyFromCents(result.data.expenseCents)}
									<br />
									em despesas
								</div>
							</div>
						</div>
						<div>
							<p className="island-kicker">
								{result.data.period.startDate} a {result.data.period.endDate}
							</p>
							<CardTitle className="mt-1 text-2xl font-semibold text-foreground">
								Despesas por categoria
							</CardTitle>
							<ExpenseCategoryTree
								nodes={
									result.data.expenseCategoryTree as ExpenseCategoryTreeNode[]
								}
							/>
						</div>
					</FinanceCard>
					<FinanceCard className="mt-7 p-5">
						<CardTitle className="text-2xl font-semibold text-foreground">
							Entradas por forma de pagamento
						</CardTitle>
						<ul className="mt-3 divide-y divide-border">
							{result.data.incomeByPaymentMethod.map((item) => (
								<li
									className="flex justify-between py-2"
									key={item.paymentMethodId ?? "none"}
								>
									<span className="text-foreground">{item.name}</span>
									<strong className="text-foreground">
										{moneyFromCents(item.amountCents)}
									</strong>
								</li>
							))}
						</ul>
					</FinanceCard>
				</>
			)}
		</>
	);
}

export function FinancePage({ kind }: { kind: FinancePageKind }) {
	const queryClient = useQueryClient();
	const { data: sessionUser } = useQuery(sessionQueryOptions());
	const online = useOnlineStatus();
	const logout = async () => {
		await authClient.signOut();
		await clearNavigationCache().catch(() => undefined);
		window.location.assign("/login");
	};
	const [editing, setEditing] = useState<TransactionDto | null>(null);
	const [viewing, setViewing] = useState<TransactionDto | null>(null);
	useEffect(() => {
		if (online) return;
		setEditing(null);
		setViewing(null);
	}, [online]);
	const openNewTransaction = () => setEditing({} as TransactionDto);
	const handleSaved = () => {
		setEditing(null);
		void queryClient.invalidateQueries({ queryKey: financeQueryKey });
	};
	return (
		<AppShell
			offline={!online}
			user={sessionUser ?? null}
			onLogout={() => void logout()}
			onNewTransaction={openNewTransaction}
		>
			<TransactionDialog
				editing={editing}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onSaved={handleSaved}
			/>
			<TransactionDetailsDialog
				onEdit={
					viewing?.archivedAt
						? undefined
						: (transaction) => {
								setViewing(null);
								setEditing(transaction);
							}
				}
				onOpenChange={(open) => {
					if (!open) setViewing(null);
				}}
				open={Boolean(viewing)}
				transaction={viewing}
			/>
			{kind === "dashboard" ? (
				<Dashboard onView={setViewing} />
			) : kind === "transactions" ? (
				<Transactions onEdit={setEditing} onView={setViewing} />
			) : kind === "settings" ? (
				<Settings />
			) : kind === "categories" ? (
				<Categories />
			) : kind === "payments" ? (
				<Payments />
			) : kind === "profile" ? (
				<Profile user={sessionUser ?? null} />
			) : kind === "archive" ? (
				<Archive onView={setViewing} />
			) : (
				<Reports />
			)}
		</AppShell>
	);
}
