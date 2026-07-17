import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { authClient } from "#/lib/auth-client.ts";
import {
	CATEGORY_COLORS,
	CATEGORY_ICONS,
	saoPauloToday,
} from "#/lib/finance.ts";
import type { CategoryDto, TransactionDto } from "#/server/finance.ts";
import {
	archiveCategory,
	archiveTransaction,
	createCategory,
	createTransaction,
	getDashboard,
	getReport,
	listCategories,
	listTransactions,
	restoreCategory,
	restoreTransaction,
	updateCategory,
	updateTransaction,
} from "#/server/finance.ts";

import { AppShell } from "./app-shell.tsx";
import { CategoryMark } from "./presentation.tsx";

type FinancePageKind =
	| "dashboard"
	| "transactions"
	| "reports"
	| "categories"
	| "archive";
type Kind = "income" | "expense";

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
		<p className="mt-3 rounded-lg border border-red-300/60 bg-red-50/80 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
			{children}
		</p>
	);
}
function Loading() {
	return (
		<p className="py-10 text-sm text-[color:var(--sea-ink-soft)]">
			Carregando…
		</p>
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
				<h1 className="display-title mt-1 text-4xl font-bold text-[color:var(--sea-ink)]">
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
			<p className="py-8 text-sm text-[color:var(--sea-ink-soft)]">
				Nenhum lançamento por aqui.
			</p>
		);
	return (
		<ul className="divide-y divide-[color:var(--line)]">
			{items.map((item) => (
				<li className="flex items-center gap-3 py-3" key={item.id}>
					<CategoryMark
						colorKey={item.category.colorKey}
						iconKey={item.category.iconKey}
					/>
					<div className="min-w-0 flex-1">
						<p className="font-semibold text-[color:var(--sea-ink)]">
							{item.category.name}
						</p>
						<p className="truncate text-xs text-[color:var(--sea-ink-soft)]">
							{item.occurredAt}
							{item.description ? ` · ${item.description}` : ""}
						</p>
					</div>
					<p
						className={
							item.type === "income"
								? "font-bold text-emerald-700 dark:text-emerald-300"
								: "font-bold text-rose-700 dark:text-rose-300"
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

function Dashboard() {
	const result = useAsyncData(() => getDashboard(), []);
	if (result.loading) return <Loading />;
	if (result.error || !result.data)
		return <Notice>{result.error ?? "Dados indisponíveis."}</Notice>;
	const { month, recentTransactions } = result.data;
	return (
		<>
			<PageTitle eyebrow="visão geral" title="Seu mês em movimento" />
			<section className="grid gap-4 md:grid-cols-3">
				<Summary label="Entradas" value={month.incomeCents} tone="income" />
				<Summary label="Saídas" value={month.expenseCents} tone="expense" />
				<Summary label="Saldo" value={month.balanceCents} tone="balance" />
			</section>
			<section className="island-shell mt-7 rounded-2xl p-5">
				<div className="mb-3 flex items-center justify-between">
					<h2 className="display-title text-2xl font-bold">
						Últimos lançamentos
					</h2>
					<a className="text-sm font-bold" href="/transactions">
						Ver histórico
					</a>
				</div>
				<TransactionRows items={recentTransactions} />
			</section>
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
			? "text-emerald-700 dark:text-emerald-300"
			: tone === "expense"
				? "text-rose-700 dark:text-rose-300"
				: "text-[color:var(--sea-ink)]";
	return (
		<article className="island-shell rounded-2xl p-5">
			<p className="island-kicker">{label}</p>
			<p className={`mt-2 text-2xl font-extrabold ${className}`}>
				{moneyFromCents(value)}
			</p>
		</article>
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
	const [type, setType] = useState<Kind>(initial?.type ?? "expense");
	const categoriesResult = useAsyncData(
		() => listCategories({ data: { status: "active" } }),
		[],
	);
	const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
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
	useEffect(() => {
		if (!choices.some((category) => category.id === categoryId))
			setCategoryId(choices[0]?.id ?? "");
	}, [choices, categoryId]);
	async function submit(event: React.FormEvent) {
		event.preventDefault();
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
		<form
			className="island-shell mb-6 grid gap-3 rounded-2xl p-5 md:grid-cols-2"
			onSubmit={submit}
		>
			<div>
				<Label htmlFor="transaction-type">Tipo</Label>
				<select
					className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
					id="transaction-type"
					onChange={(event) => setType(event.target.value as Kind)}
					value={type}
				>
					<option value="expense">Despesa</option>
					<option value="income">Receita</option>
				</select>
			</div>
			<div>
				<Label htmlFor="transaction-category">Categoria</Label>
				<select
					className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
					id="transaction-category"
					onChange={(event) => setCategoryId(event.target.value)}
					value={categoryId}
				>
					{choices.map((category) => (
						<option key={category.id} value={category.id}>
							{category.name}
						</option>
					))}
				</select>
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
			<div className="md:col-span-2">
				<Label htmlFor="transaction-description">Descrição opcional</Label>
				<Input
					id="transaction-description"
					maxLength={280}
					onChange={(event) => setDescription(event.target.value)}
					value={description}
				/>
			</div>
			{error && (
				<div className="md:col-span-2">
					<Notice>{error}</Notice>
				</div>
			)}
			<div className="flex gap-2 md:col-span-2">
				<Button disabled={saving || categoriesResult.loading} type="submit">
					{saving
						? "Salvando…"
						: initial
							? "Salvar alterações"
							: "Adicionar lançamento"}
				</Button>
				{onCancel && (
					<Button onClick={onCancel} type="button" variant="outline">
						Cancelar
					</Button>
				)}
			</div>
		</form>
	);
}

function Transactions() {
	const [refresh, setRefresh] = useState(0);
	const [editing, setEditing] = useState<TransactionDto | undefined>();
	const result = useAsyncData(
		() => listTransactions({ data: { scope: "active" } }),
		[refresh],
	);
	async function archive(item: TransactionDto) {
		if (!window.confirm(`Arquivar ${item.category.name}?`)) return;
		await archiveTransaction({ data: { id: item.id } });
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
			<PageTitle eyebrow="histórico" title="Lançamentos">
				<Button onClick={() => setEditing({} as TransactionDto)}>
					<Plus /> Novo
				</Button>
			</PageTitle>
			{editing && (
				<TransactionForm
					initial={editing.id ? editing : undefined}
					onCancel={() => setEditing(undefined)}
					onSaved={() => {
						setEditing(undefined);
						setRefresh((value) => value + 1);
					}}
				/>
			)}
			{result.loading ? (
				<Loading />
			) : result.error || !result.data ? (
				<Notice>{result.error ?? "Dados indisponíveis."}</Notice>
			) : (
				<section className="island-shell rounded-2xl p-5">
					<TransactionRows
						items={result.data.items}
						onArchive={archive}
						onEdit={(item) => setEditing(item)}
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
				</section>
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
	const [error, setError] = useState<string | null>(null);
	async function submit(event: React.FormEvent) {
		event.preventDefault();
		try {
			if (initial)
				await updateCategory({
					data: { id: initial.id, name, colorKey, iconKey },
				});
			else await createCategory({ data: { type, name, colorKey, iconKey } });
			onSaved();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Não foi possível salvar.",
			);
		}
	}
	return (
		<form
			className="island-shell mb-6 grid gap-3 rounded-2xl p-5 md:grid-cols-2"
			onSubmit={submit}
		>
			<div>
				<Label htmlFor="category-type">Tipo</Label>
				<select
					className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
					disabled={Boolean(initial)}
					id="category-type"
					onChange={(event) => setType(event.target.value as Kind)}
					value={type}
				>
					<option value="expense">Despesa</option>
					<option value="income">Receita</option>
				</select>
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
				<select
					className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
					id="category-color"
					onChange={(event) =>
						setColorKey(event.target.value as typeof colorKey)
					}
					value={colorKey}
				>
					{CATEGORY_COLORS.map((color) => (
						<option key={color}>{color}</option>
					))}
				</select>
			</div>
			<div>
				<Label htmlFor="category-icon">Ícone</Label>
				<select
					className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
					id="category-icon"
					onChange={(event) => setIconKey(event.target.value as typeof iconKey)}
					value={iconKey}
				>
					{CATEGORY_ICONS.map((icon) => (
						<option key={icon}>{icon}</option>
					))}
				</select>
			</div>
			{error && (
				<div className="md:col-span-2">
					<Notice>{error}</Notice>
				</div>
			)}
			<div className="flex gap-2 md:col-span-2">
				<Button type="submit">
					{initial ? "Salvar categoria" : "Criar categoria"}
				</Button>
				{onCancel && (
					<Button onClick={onCancel} type="button" variant="outline">
						Cancelar
					</Button>
				)}
			</div>
		</form>
	);
}

function Categories() {
	const [status, setStatus] = useState<"active" | "archived">("active");
	const [refresh, setRefresh] = useState(0);
	const [editing, setEditing] = useState<CategoryDto | undefined>();
	const result = useAsyncData(
		() => listCategories({ data: { status } }),
		[status, refresh],
	);
	async function toggle(category: CategoryDto) {
		if (status === "active") {
			if (!window.confirm(`Arquivar ${category.name}?`)) return;
			await archiveCategory({ data: { id: category.id } });
		} else await restoreCategory({ data: { id: category.id } });
		setRefresh((value) => value + 1);
	}
	return (
		<>
			<PageTitle eyebrow="organização" title="Categorias">
				<Button onClick={() => setEditing({} as CategoryDto)}>
					<Plus /> Nova
				</Button>
			</PageTitle>
			{editing && (
				<CategoryForm
					initial={editing.id ? editing : undefined}
					onCancel={() => setEditing(undefined)}
					onSaved={() => {
						setEditing(undefined);
						setRefresh((value) => value + 1);
					}}
				/>
			)}
			<div className="mb-4 flex gap-2">
				<Button
					onClick={() => setStatus("active")}
					variant={status === "active" ? "default" : "outline"}
				>
					Ativas
				</Button>
				<Button
					onClick={() => setStatus("archived")}
					variant={status === "archived" ? "default" : "outline"}
				>
					Arquivadas
				</Button>
			</div>
			{result.loading ? (
				<Loading />
			) : result.error || !result.data ? (
				<Notice>{result.error ?? "Dados indisponíveis."}</Notice>
			) : (
				<section className="island-shell rounded-2xl p-5">
					<ul className="divide-y divide-[color:var(--line)]">
						{result.data.map((category) => (
							<li className="flex items-center gap-3 py-3" key={category.id}>
								<CategoryMark
									colorKey={category.colorKey}
									iconKey={category.iconKey}
								/>
								<div className="flex-1">
									<p className="font-semibold">{category.name}</p>
									<p className="text-xs text-[color:var(--sea-ink-soft)]">
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
									onClick={() => toggle(category)}
									size="icon"
									variant="ghost"
								>
									{status === "active" ? <Trash2 /> : <RotateCcw />}
								</Button>
							</li>
						))}
					</ul>
				</section>
			)}
		</>
	);
}

function Archive() {
	const [refresh, setRefresh] = useState(0);
	const result = useAsyncData(
		() => listTransactions({ data: { scope: "archived" } }),
		[refresh],
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
				<section className="island-shell rounded-2xl p-5">
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
				</section>
			)}
		</>
	);
}

function Reports() {
	const [granularity, setGranularity] = useState<"day" | "week" | "month">(
		"month",
	);
	const [anchorDate, setAnchorDate] = useState(saoPauloToday());
	const result = useAsyncData(
		() => getReport({ data: { granularity, anchorDate } }),
		[granularity, anchorDate],
	);
	const report = result.data;
	const chartColors: Record<string, string> = {
		emerald: "#10b981",
		cyan: "#06b6d4",
		violet: "#8b5cf6",
		blue: "#3b82f6",
		orange: "#f97316",
		amber: "#f59e0b",
		rose: "#f43f5e",
		teal: "#14b8a6",
	};
	const donut = report?.expenseByCategory.length
		? (() => {
				let offset = 0;
				return report.expenseByCategory
					.map((item) => {
						const start = offset;
						offset += (item.amountCents / report.expenseCents) * 100;
						return `${chartColors[item.colorKey] ?? "#64748b"} ${start}% ${offset}%`;
					})
					.join(", ");
			})()
		: "var(--line) 0 100%";
	return (
		<>
			<PageTitle eyebrow="relatórios" title="Para onde foi seu dinheiro" />
			<section className="island-shell mb-6 flex flex-wrap gap-3 rounded-2xl p-4">
				<select
					className="h-9 w-40 rounded-md border border-input bg-transparent px-3 text-sm"
					onChange={(event) =>
						setGranularity(event.target.value as typeof granularity)
					}
					value={granularity}
				>
					<option value="day">Dia</option>
					<option value="week">Semana</option>
					<option value="month">Mês</option>
				</select>
				<Input
					className="w-44"
					onChange={(event) => setAnchorDate(event.target.value)}
					type="date"
					value={anchorDate}
				/>
			</section>
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
					<section className="island-shell mt-7 grid gap-6 rounded-2xl p-5 md:grid-cols-[180px_1fr]">
						<div
							className="mx-auto size-40 rounded-full"
							style={{
								background: `conic-gradient(${donut})`,
							}}
						>
							<div className="m-6 grid size-28 place-items-center rounded-full bg-[color:var(--surface-strong)] text-center text-xs font-bold">
								{moneyFromCents(result.data.expenseCents)}
								<br />
								em despesas
							</div>
						</div>
						<div>
							<p className="island-kicker">
								{result.data.period.startDate} a {result.data.period.endDate}
							</p>
							<h2 className="display-title mt-1 text-2xl font-bold">
								Despesas por categoria
							</h2>
							<ul className="mt-3 divide-y divide-[color:var(--line)]">
								{result.data.expenseByCategory.map((item) => (
									<li
										className="flex items-center gap-3 py-3"
										key={item.categoryId}
									>
										<CategoryMark
											colorKey={item.colorKey}
											iconKey={item.iconKey}
										/>
										<span className="flex-1 font-semibold">
											{item.categoryName}
										</span>
										<span className="font-bold">
											{moneyFromCents(item.amountCents)}
										</span>
									</li>
								))}
							</ul>
						</div>
					</section>
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
	return (
		<AppShell onLogout={() => void logout()}>
			{kind === "dashboard" ? (
				<Dashboard />
			) : kind === "transactions" ? (
				<Transactions />
			) : kind === "categories" ? (
				<Categories />
			) : kind === "archive" ? (
				<Archive />
			) : (
				<Reports />
			)}
		</AppShell>
	);
}
