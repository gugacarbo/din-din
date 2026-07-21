import { ResizableDrawer } from "#/components/resizable-drawer.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import type { TransactionDto } from "#/server/finance.ts";

import { CategoryMark } from "./presentation.tsx";

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
function Detail({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<dt className="text-xs font-medium text-muted-foreground">{label}</dt>
			<dd className="mt-1 text-sm font-semibold text-foreground">{children}</dd>
		</div>
	);
}

/** Reusable read-only view for a transaction across finance lists. */
export function TransactionDetailsDialog({
	transaction,
	onEdit,
	onOpenChange,
	open,
}: {
	transaction: TransactionDto | null;
	onEdit?: (transaction: TransactionDto) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const isMobile = useIsMobile();
	if (!transaction) return null;
	const isIncome = transaction.type === "income";
	const paymentMethod = transaction.paymentMethod;
	const description = onEdit
		? "Confira as informações antes de editar este lançamento."
		: "Confira as informações deste lançamento.";
	const editAction = onEdit && (
		<Button onClick={() => onEdit(transaction)}>Editar lançamento</Button>
	);
	const details = (
		<>
			<div className="flex items-center gap-3 rounded-xl border p-4">
				<CategoryMark
					colorKey={transaction.category.colorKey}
					iconKey={transaction.category.iconKey}
				/>
				<div className="min-w-0 flex-1">
					<p className="font-bold text-foreground">
						{transaction.category.name}
					</p>
					<p className="text-sm text-muted-foreground">
						{isIncome ? "Entrada" : "Saída"}
					</p>
				</div>
				<p
					className={
						isIncome
							? "font-extrabold text-income"
							: "font-extrabold text-destructive"
					}
				>
					{isIncome ? "+" : "−"}
					{money.format(transaction.amountCents / 100)}
				</p>
			</div>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-5">
				<Detail label="Data">
					{date.format(new Date(`${transaction.occurredAt}T12:00:00Z`))}
				</Detail>
				<Detail label="Forma de pagamento">
					{paymentMethod ? (
						<span className="flex items-center gap-2">
							<CategoryMark
								className="size-6 rounded-lg"
								colorKey={paymentMethod.colorKey}
								iconClassName="size-3"
								iconKey={paymentMethod.iconKey}
							/>
							{paymentMethod.name}
						</span>
					) : (
						"Não informado"
					)}
				</Detail>
				{transaction.description && (
					<Detail label="Descrição">{transaction.description}</Detail>
				)}
				{transaction.invoiceCycleClosingDate &&
					transaction.invoiceCycleDueDate && (
						<Detail label="Fatura">
							Fecha em {transaction.invoiceCycleClosingDate} · vence em{" "}
							{transaction.invoiceCycleDueDate}
						</Detail>
					)}
			</dl>
		</>
	);
	if (isMobile)
		return (
			<ResizableDrawer
				description={description}
				footer={editAction}
				onOpenChange={onOpenChange}
				open={open}
				title="Detalhes do lançamento"
			>
				{details}
			</ResizableDrawer>
		);

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Detalhes do lançamento</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{details}
				{editAction && <DialogFooter>{editAction}</DialogFooter>}
			</DialogContent>
		</Dialog>
	);
}
