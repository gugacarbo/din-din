import { CircleAlert, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
	type ComponentProps,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Cell, Pie, PieChart } from "recharts";

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
import { Card } from "#/components/ui/card.tsx";
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
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs.tsx";
import { authClient } from "#/lib/auth-client.ts";
import {
	CATEGORY_COLORS,
	CATEGORY_ICONS,
	saoPauloToday,
} from "#/lib/finance.ts";
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
	getDashboard,
	getReport,
	listCategories,
	listInvoices,
	listPaymentMethods,
	listTransactions,
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

type FinancePageKind =
	| "dashboard"
	| "transactions"
	| "reports"
	| "categories"
	| "payments"
	| "archive";

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});
const moneyFromCents = (value: number) => money.format(value / 100);
const kindLabel = (kind: Kind) => (kind === "income" ? "Receita" : "Despesa");
function useAsyncData<T>(load: () => Promise<T>, dependencies: unknown[]) {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const dependencyKey = JSON.stringify(dependencies);
	const loadRef = useRef(load);
	useEffect(() => {
		loadRef.current = load;
	}, [load]);
	useEffect(() => {
		void dependencyKey;
		let alive = true;
		setLoading(true);
		loadRef
			.current()
			.then((next) => {
				if (alive) {
					setData(next);
					setError(null);
				}
			})
			.catch((cause: unknown) => {
				if (alive)
					setError(
						cause instanceof Error
							? cause.message
							: "Não foi possível carregar os dados.",
					);
			})
			.finally(() => {
				if (alive) setLoading(false);
			});
		return () => {
			alive = false;
		};
	}, [dependencyKey]);
	return { data, error, loading, setData };
}

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
}: {
	eyebrow: string;
	title: string;
	children?: React.ReactNode;
}) {
	return (
		<header className="mb-7 flex flex-wrap items-end justify-between gap-4">
			<div>
				<p className="island-kicker">{eyebrow}</p>
				<h1 className="display-title mt-1 text-4xl font-bold text-foreground">
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
}: {
	items: TransactionDto[];
	onEdit?: (item: TransactionDto) => void;
	onArchive?: (item: TransactionDto) => void;
	onRestore?: (item: TransactionDto) => void;
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
								: "font-bold text-destructive"
						}
					>
						{item.type === "income" ? "+" : "−"}
						{moneyFromCents(item.amountCents)}
					</p>
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

function Dashboard({ refreshKey }: { refreshKey: number }) {
	const result = useAsyncData(() => getDashboard(), [refreshKey]);
	if (result.loading) return <Loading />;
	if (result.error || !result.data)
		return <Notice>{result.error ?? "Dados indisponíveis."}</Notice>;
	const { month, recentTransactions, incomeByPaymentMethod } = result.data;
	return (
		<>
			<PageTitle eyebrow="visão geral" title="Seu mês em movimento" />
			<section className="grid gap-4 md:grid-cols-3">
				<Summary label="Entradas" value={month.incomeCents} tone="income" />
				<Summary label="Saídas" value={month.expenseCents} tone="expense" />
				<Summary label="Saldo" value={month.balanceCents} tone="balance" />
			</section>
			<FinanceCard className="mt-7 p-5">
				<h2 className="display-title text-2xl font-bold">
					De onde vieram as entradas
				</h2>
				<ul className="mt-3 divide-y divide-border">
					{incomeByPaymentMethod.map((item) => (
						<li
							className="flex justify-between py-2"
							key={item.paymentMethodId ?? "none"}
						>
							<span>{item.name}</span>
							<strong>{moneyFromCents(item.amountCents)}</strong>
						</li>
					))}
				</ul>
			</FinanceCard>
			<FinanceCard className="mt-7 p-5">
				<div className="mb-3 flex items-center justify-between">
					<h2 className="display-title text-2xl font-bold">
						Últimos lançamentos
					</h2>
					<a className="text-sm font-bold" href="/transactions">
						Ver histórico
					</a>
				</div>
				<TransactionRows items={recentTransactions} />
			</FinanceCard>
		</>
	);
}

function Summary({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone: "income" | "expense" | "balance";
}) {
	const className =
		tone === "income"
			? "text-income"
			: tone === "expense"
				? "text-destructive"
				: "text-foreground";
	return (
		<FinanceCard className="p-5">
			<p className="island-kicker">{label}</p>
			<p className={`mt-2 text-2xl font-extrabold ${className}`}>
				{moneyFromCents(value)}
			</p>
		</FinanceCard>
	);
}

function TransactionForm({
	initial,
	onSaved,
	onCancel,
}: {
	initial?: TransactionDto;
	onSaved: () => void;
	onCancel?: () => void;
}) {
	const [type, setType] = useState<Kind | undefined>(initial?.type);
	const categoriesResult = useAsyncData(
		() => listCategories({ data: { status: "active" } }),
		[],
	);
	const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
	const [paymentMethodId, setPaymentMethodId] = useState(
		initial?.paymentMethodId ?? "",
	);
	const paymentMethodsResult = useAsyncData(
		() => listPaymentMethods({ data: { status: "all" } }),
		[],
	);
	const [amount, setAmount] = useState(
		initial ? String(initial.amountCents / 100) : "",
	);
	const [occurredAt, setOccurredAt] = useState(
		initial?.occurredAt ?? saoPauloToday(),
	);
	const [description, setDescription] = useState(initial?.description ?? "");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
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
		if (!choices.some((category) => category.id === categoryId))
			setCategoryId(choices[0]?.id ?? "");
	}, [choices, categoryId]);
	async function submit(event: React.FormEvent) {
		event.preventDefault();
		if (!type) {
			setError("Escolha o tipo do lançamento antes de salvar.");
			return;
		}
		const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);
		if (!categoryId || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
			setError("Informe uma categoria e um valor maior que zero.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const data = {
				type,
				categoryId,
				amountCents,
				occurredAt,
				description: description || null,
				paymentMethodId: paymentMethodId || null,
			};
			if (initial)
				await updateTransaction({ data: { ...data, id: initial.id } });
			else await createTransaction({ data });
			onSaved();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Não foi possível salvar.",
			);
		} finally {
			setSaving(false);
		}
	}
	return (
		<form className="grid gap-4" noValidate onSubmit={submit}>
			<div>
				<Label htmlFor="transaction-payment-method">
					Forma de pagamento (opcional)
				</Label>
				<Select
					onValueChange={(value) =>
						setPaymentMethodId(value === "none" ? "" : value)
					}
					value={paymentMethodId || "none"}
				>
					<SelectTrigger className="w-full" id="transaction-payment-method">
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
			</div>
			<div>
				<Label htmlFor="transaction-type">Tipo</Label>
				<KindSelect
					aria-describedby={
						error && !type ? "transaction-type-error" : undefined
					}
					aria-invalid={!type}
					id="transaction-type"
					onValueChange={setType}
					value={type}
				/>
			</div>
			<div>
				<Label htmlFor="transaction-category">Categoria</Label>
				<CategorySelect
					categories={choices}
					disabled={!type}
					id="transaction-category"
					onValueChange={setCategoryId}
					value={categoryId}
				/>
			</div>
			<div>
				<Label htmlFor="transaction-amount">Valor (R$)</Label>
				<Input
					id="transaction-amount"
					inputMode="decimal"
					onChange={(event) => setAmount(event.target.value)}
					required
					step="0.01"
					type="number"
					value={amount}
				/>
			</div>
			<div>
				<Label htmlFor="transaction-date">Data</Label>
				<Input
					id="transaction-date"
					onChange={(event) => setOccurredAt(event.target.value)}
					required
					type="date"
					value={occurredAt}
				/>
			</div>
			<div>
				<Label htmlFor="transaction-description">Descrição opcional</Label>
				<Input
					id="transaction-description"
					maxLength={280}
					onChange={(event) => setDescription(event.target.value)}
					value={description}
				/>
			</div>
			{error && (
				<Notice>
					<span id={!type ? "transaction-type-error" : undefined} role="alert">
						{error}
					</span>
				</Notice>
			)}
			<DialogFooter>
				<Button disabled={saving || categoriesResult.loading} type="submit">
					{saving
						? "Salvando…"
						: initial
							? "Salvar alterações"
							: "Adicionar lançamento"}
				</Button>
				<Button onClick={onCancel} type="button" variant="outline">
					Cancelar
				</Button>
			</DialogFooter>
		</form>
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
	const isEdit = Boolean(editing?.id);
	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) onOpenChange(false);
			}}
			open={Boolean(editing)}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Editar lançamento" : "Novo lançamento"}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Ajuste os dados do lançamento abaixo."
							: "Preencha os dados para criar um novo lançamento."}
					</DialogDescription>
				</DialogHeader>
				{editing && (
					<TransactionForm
						initial={isEdit ? editing : undefined}
						onCancel={() => onOpenChange(false)}
						onSaved={() => {
							onOpenChange(false);
							onSaved();
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function Transactions({
	refreshKey,
	onEdit,
}: {
	refreshKey: number;
	onEdit: (item: TransactionDto) => void;
}) {
	const [refresh, setRefresh] = useState(0);
	const [archiving, setArchiving] = useState<TransactionDto | null>(null);
	const result = useAsyncData(
		() => listTransactions({ data: { scope: "active" } }),
		[refresh, refreshKey],
	);
	async function archive() {
		if (!archiving) return;
		await archiveTransaction({ data: { id: archiving.id } });
		setArchiving(null);
		setRefresh((value) => value + 1);
	}
	async function loadMore() {
		if (!result.data?.nextCursor) return;
		const next = await listTransactions({
			data: { scope: "active", cursor: result.data.nextCursor },
		});
		result.setData({
			items: [...result.data.items, ...next.items],
			nextCursor: next.nextCursor,
		});
	}
	return (
		<>
			<PageTitle eyebrow="histórico" title="Lançamentos" />
			<ArchiveConfirmation
				itemName={archiving?.category.name ?? "este lançamento"}
				onConfirm={() => void archive()}
				onOpenChange={(open) => {
					if (!open) setArchiving(null);
				}}
				open={Boolean(archiving)}
			/>
			{result.loading ? (
				<Loading />
			) : result.error || !result.data ? (
				<Notice>{result.error ?? "Dados indisponíveis."}</Notice>
			) : (
				<FinanceCard className="p-5">
					<TransactionRows
						items={result.data.items}
						onArchive={setArchiving}
						onEdit={onEdit}
					/>
					{result.data.nextCursor && (
						<Button
							className="mt-4"
							onClick={() => void loadMore()}
							variant="outline"
						>
							Carregar mais
						</Button>
					)}
				</FinanceCard>
			)}
		</>
	);
}

function CategoryForm({
	initial,
	onSaved,
	onCancel,
}: {
	initial?: CategoryDto;
	onSaved: () => void;
	onCancel?: () => void;
}) {
	const [type, setType] = useState<Kind>(initial?.type ?? "expense");
	const [name, setName] = useState(initial?.name ?? "");
	const [colorKey, setColorKey] = useState<(typeof CATEGORY_COLORS)[number]>(
		(initial?.colorKey as (typeof CATEGORY_COLORS)[number]) ??
			CATEGORY_COLORS[0],
	);
	const [iconKey, setIconKey] = useState<(typeof CATEGORY_ICONS)[number]>(
		(initial?.iconKey as (typeof CATEGORY_ICONS)[number]) ?? CATEGORY_ICONS[0],
	);
	const [parentCategoryId, setParentCategoryId] = useState(
		initial?.parentCategoryId ?? "",
	);
	const categoriesResult = useAsyncData(
		() => listCategories({ data: { status: "active" } }),
		[],
	);
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
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	async function submit(event: React.FormEvent) {
		event.preventDefault();
		setSaving(true);
		setError(null);
		try {
			if (initial)
				await updateCategory({
					data: {
						id: initial.id,
						name,
						colorKey,
						iconKey,
						parentCategoryId: parentCategoryId || null,
					},
				});
			else
				await createCategory({
					data: {
						type,
						name,
						colorKey,
						iconKey,
						parentCategoryId: parentCategoryId || null,
					},
				});
			onSaved();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Não foi possível salvar.",
			);
		} finally {
			setSaving(false);
		}
	}
	return (
		<form className="grid gap-4" onSubmit={submit}>
			<div>
				<Label htmlFor="category-parent">Categoria pai (opcional)</Label>
				<CategorySelect
					categories={parentChoices}
					id="category-parent"
					onValueChange={(value) =>
						setParentCategoryId(value === "root" ? "" : value)
					}
					placeholder="Categoria raiz"
					rootOption={{ label: "Categoria raiz", value: "root" }}
					value={parentCategoryId || "root"}
				/>
			</div>
			<div>
				<Label htmlFor="category-type">Tipo</Label>
				<KindSelect
					disabled={Boolean(initial)}
					id="category-type"
					onValueChange={setType}
					value={type}
				/>
			</div>
			<div>
				<Label htmlFor="category-name">Nome</Label>
				<Input
					id="category-name"
					maxLength={40}
					onChange={(event) => setName(event.target.value)}
					required
					value={name}
				/>
			</div>
			<div>
				<Label htmlFor="category-color">Cor</Label>
				<ColorSelect
					id="category-color"
					onValueChange={(value) => setColorKey(value as typeof colorKey)}
					value={colorKey}
				/>
			</div>
			<div>
				<Label htmlFor="category-icon">Ícone</Label>
				<IconSelect
					id="category-icon"
					onValueChange={(value) => setIconKey(value as typeof iconKey)}
					value={iconKey}
				/>
			</div>
			{error && <Notice>{error}</Notice>}
			<DialogFooter>
				<Button disabled={saving} type="submit">
					{saving
						? "Salvando…"
						: initial
							? "Salvar alterações"
							: "Criar categoria"}
				</Button>
				<Button onClick={onCancel} type="button" variant="outline">
					Cancelar
				</Button>
			</DialogFooter>
		</form>
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
	const isEdit = Boolean(editing?.id);
	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) onOpenChange(false);
			}}
			open={Boolean(editing)}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Editar categoria" : "Nova categoria"}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Ajuste os dados da categoria abaixo."
							: "Preencha os dados para criar uma nova categoria."}
					</DialogDescription>
				</DialogHeader>
				{editing && (
					<CategoryForm
						initial={isEdit ? editing : undefined}
						onCancel={() => onOpenChange(false)}
						onSaved={() => {
							onOpenChange(false);
							onSaved();
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function Categories() {
	const [status, setStatus] = useState<"active" | "archived">("active");
	const [refresh, setRefresh] = useState(0);
	const [editing, setEditing] = useState<CategoryDto | null>(null);
	const [archiving, setArchiving] = useState<CategoryDto | null>(null);
	const result = useAsyncData(
		() => listCategories({ data: { status } }),
		[status, refresh],
	);
	async function archive() {
		if (!archiving) return;
		await archiveCategory({ data: { id: archiving.id } });
		setArchiving(null);
		setRefresh((value) => value + 1);
	}
	async function restore(category: CategoryDto) {
		await restoreCategory({ data: { id: category.id } });
		setRefresh((value) => value + 1);
	}
	return (
		<>
			<PageTitle eyebrow="organização" title="Categorias">
				<Button onClick={() => setEditing({} as CategoryDto)}>
					<Plus /> Nova
				</Button>
			</PageTitle>
			<CategoryDialog
				editing={editing}
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				onSaved={() => setRefresh((value) => value + 1)}
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
			{result.loading ? (
				<Loading />
			) : result.error || !result.data ? (
				<Notice>{result.error ?? "Dados indisponíveis."}</Notice>
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
	onSaved,
	onCancel,
}: {
	initial?: PaymentMethodDto;
	onSaved: () => void;
	onCancel: () => void;
}) {
	const [name, setName] = useState(initial?.name ?? "");
	const [kind, setKind] = useState<PaymentMethodDto["kind"]>(
		initial?.kind ?? "credit_card",
	);
	const [colorKey, setColorKey] = useState<(typeof CATEGORY_COLORS)[number]>(
		(initial?.colorKey as (typeof CATEGORY_COLORS)[number]) ??
			CATEGORY_COLORS[0],
	);
	const [iconKey, setIconKey] = useState<(typeof CATEGORY_ICONS)[number]>(
		(initial?.iconKey as (typeof CATEGORY_ICONS)[number]) ?? "CreditCard",
	);
	const [invoiceControl, setInvoiceControl] = useState(
		initial?.invoiceControl ?? false,
	);
	const [closingDay, setClosingDay] = useState(
		initial?.closingDay ? String(initial.closingDay) : "",
	);
	const [dueDay, setDueDay] = useState(
		initial?.dueDay ? String(initial.dueDay) : "",
	);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const canInvoice = kind === "credit_card" && invoiceControl;
	async function submit(event: React.FormEvent) {
		event.preventDefault();
		setSaving(true);
		setError(null);
		try {
			const data = {
				name,
				kind,
				colorKey,
				iconKey,
				invoiceControl: canInvoice,
				closingDay: canInvoice ? Number(closingDay) : null,
				dueDay: canInvoice ? Number(dueDay) : null,
			};
			if (initial)
				await updatePaymentMethod({ data: { id: initial.id, ...data } });
			else await createPaymentMethod({ data });
			onSaved();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Não foi possível salvar.",
			);
		} finally {
			setSaving(false);
		}
	}
	return (
		<form className="grid gap-4" onSubmit={submit}>
			<div>
				<Label htmlFor="payment-name">Nome</Label>
				<Input
					id="payment-name"
					maxLength={80}
					onChange={(event) => setName(event.target.value)}
					required
					value={name}
				/>
			</div>
			<div>
				<Label htmlFor="payment-kind">Tipo</Label>
				<Select
					onValueChange={(value) => setKind(value as PaymentMethodDto["kind"])}
					value={kind}
				>
					<SelectTrigger className="w-full" id="payment-kind">
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
			</div>
			<div>
				<Label htmlFor="payment-color">Cor</Label>
				<ColorSelect
					id="payment-color"
					onValueChange={(value) => setColorKey(value as typeof colorKey)}
					value={colorKey}
				/>
			</div>
			<div>
				<Label htmlFor="payment-icon">Ícone</Label>
				<IconSelect
					id="payment-icon"
					onValueChange={(value) => setIconKey(value as typeof iconKey)}
					value={iconKey}
				/>
			</div>
			{kind === "credit_card" && (
				<label className="flex items-center gap-2 text-sm font-medium">
					<input
						checked={invoiceControl}
						onChange={(event) => setInvoiceControl(event.target.checked)}
						type="checkbox"
					/>{" "}
					Controlar faturas
				</label>
			)}
			{canInvoice && (
				<div className="grid grid-cols-2 gap-3">
					<div>
						<Label htmlFor="payment-closing-day">Fechamento</Label>
						<Input
							id="payment-closing-day"
							max="31"
							min="1"
							onChange={(event) => setClosingDay(event.target.value)}
							required
							type="number"
							value={closingDay}
						/>
					</div>
					<div>
						<Label htmlFor="payment-due-day">Vencimento</Label>
						<Input
							id="payment-due-day"
							max="31"
							min="1"
							onChange={(event) => setDueDay(event.target.value)}
							required
							type="number"
							value={dueDay}
						/>
					</div>
				</div>
			)}
			{error && <Notice>{error}</Notice>}
			<DialogFooter>
				<Button disabled={saving} type="submit">
					{saving ? "Salvando…" : "Salvar forma"}
				</Button>
				<Button onClick={onCancel} type="button" variant="outline">
					Cancelar
				</Button>
			</DialogFooter>
		</form>
	);
}

function Payments() {
	const [tab, setTab] = useState<"methods" | "invoices">("methods");
	const [refresh, setRefresh] = useState(0);
	const [editing, setEditing] = useState<PaymentMethodDto | null>(null);
	const methods = useAsyncData(
		() => listPaymentMethods({ data: { status: "all" } }),
		[refresh],
	);
	const invoices = useAsyncData(() => listInvoices(), [refresh]);
	async function archive(method: PaymentMethodDto) {
		await archivePaymentMethod({ data: { id: method.id } });
		setRefresh((value) => value + 1);
	}
	async function restore(method: PaymentMethodDto) {
		await restorePaymentMethod({ data: { id: method.id } });
		setRefresh((value) => value + 1);
	}
	return (
		<>
			<PageTitle eyebrow="pagamentos" title="Formas e faturas">
				<Button onClick={() => setEditing({} as PaymentMethodDto)}>
					<Plus /> Nova forma
				</Button>
			</PageTitle>
			<Dialog
				onOpenChange={(open) => {
					if (!open) setEditing(null);
				}}
				open={Boolean(editing)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{editing?.id ? "Editar forma" : "Nova forma de pagamento"}
						</DialogTitle>
						<DialogDescription>
							Vincule receitas e despesas a este meio. A configuração de fatura
							é opcional.
						</DialogDescription>
					</DialogHeader>
					{editing && (
						<PaymentMethodForm
							initial={editing.id ? editing : undefined}
							onCancel={() => setEditing(null)}
							onSaved={() => {
								setEditing(null);
								setRefresh((value) => value + 1);
							}}
						/>
					)}
				</DialogContent>
			</Dialog>
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
				(methods.loading ? (
					<Loading />
				) : methods.error || !methods.data ? (
					<Notice>{methods.error ?? "Dados indisponíveis."}</Notice>
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
				(invoices.loading ? (
					<Loading />
				) : invoices.error || !invoices.data ? (
					<Notice>{invoices.error ?? "Dados indisponíveis."}</Notice>
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
											<h2 className="font-bold">
												{invoice.paymentMethod.name}
												{invoice.paymentMethod.archivedAt ? " (arquivado)" : ""}
											</h2>
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

function Archive({ refreshKey }: { refreshKey: number }) {
	const [refresh, setRefresh] = useState(0);
	const result = useAsyncData(
		() => listTransactions({ data: { scope: "archived" } }),
		[refresh, refreshKey],
	);
	async function restore(item: TransactionDto) {
		await restoreTransaction({ data: { id: item.id } });
		setRefresh((value) => value + 1);
	}
	async function loadMore() {
		if (!result.data?.nextCursor) return;
		const next = await listTransactions({
			data: { scope: "archived", cursor: result.data.nextCursor },
		});
		result.setData({
			items: [...result.data.items, ...next.items],
			nextCursor: next.nextCursor,
		});
	}
	return (
		<>
			<PageTitle eyebrow="arquivo" title="Lançamentos arquivados" />
			{result.loading ? (
				<Loading />
			) : result.error || !result.data ? (
				<Notice>{result.error ?? "Dados indisponíveis."}</Notice>
			) : (
				<FinanceCard className="p-5">
					<TransactionRows items={result.data.items} onRestore={restore} />
					{result.data.nextCursor && (
						<Button
							className="mt-4"
							onClick={() => void loadMore()}
							variant="outline"
						>
							Carregar mais
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
					<button
						aria-expanded={expanded}
						aria-label={`${expanded ? "Recolher" : "Expandir"} ${node.category.name}`}
						className="grid size-6 place-items-center rounded text-sm text-muted-foreground hover:bg-muted"
						onClick={() => setExpanded((value) => !value)}
						type="button"
					>
						{expanded ? "−" : "+"}
					</button>
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

function Reports({ refreshKey }: { refreshKey: number }) {
	const [granularity, setGranularity] = useState<"day" | "week" | "month">(
		"month",
	);
	const [anchorDate, setAnchorDate] = useState(saoPauloToday());
	const result = useAsyncData(
		() => getReport({ data: { granularity, anchorDate } }),
		[granularity, anchorDate, refreshKey],
	);
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
			{result.loading ? (
				<Loading />
			) : result.error || !result.data ? (
				<Notice>{result.error ?? "Dados indisponíveis."}</Notice>
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
							<h2 className="display-title mt-1 text-2xl font-bold">
								Despesas por categoria
							</h2>
							<ExpenseCategoryTree
								nodes={
									result.data.expenseCategoryTree as ExpenseCategoryTreeNode[]
								}
							/>
						</div>
					</FinanceCard>
					<FinanceCard className="mt-7 p-5">
						<h2 className="display-title text-2xl font-bold">
							Entradas por forma de pagamento
						</h2>
						<ul className="mt-3 divide-y divide-border">
							{result.data.incomeByPaymentMethod.map((item) => (
								<li
									className="flex justify-between py-2"
									key={item.paymentMethodId ?? "none"}
								>
									<span>{item.name}</span>
									<strong>{moneyFromCents(item.amountCents)}</strong>
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
	const logout = async () => {
		await authClient.signOut();
		window.location.assign("/login");
	};
	const [refreshKey, setRefreshKey] = useState(0);
	const [editing, setEditing] = useState<TransactionDto | null>(null);
	const openNewTransaction = () => setEditing({} as TransactionDto);
	const handleSaved = () => {
		setEditing(null);
		setRefreshKey((value) => value + 1);
	};
	return (
		<AppShell
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
			{kind === "dashboard" ? (
				<Dashboard refreshKey={refreshKey} />
			) : kind === "transactions" ? (
				<Transactions refreshKey={refreshKey} onEdit={setEditing} />
			) : kind === "categories" ? (
				<Categories />
			) : kind === "payments" ? (
				<Payments />
			) : kind === "archive" ? (
				<Archive refreshKey={refreshKey} />
			) : (
				<Reports refreshKey={refreshKey} />
			)}
		</AppShell>
	);
}
