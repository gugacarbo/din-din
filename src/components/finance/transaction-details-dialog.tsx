import { useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet.tsx";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import type { TransactionDto } from "#/server/finance.ts";

import { CategoryMark } from "./presentation.tsx";

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const drawerInitialHeight = (viewportHeight: number) =>
	Math.round(viewportHeight * 0.9);
const drawerMinimumHeight = (viewportHeight: number) =>
	Math.round(viewportHeight * 0.72);

function clampDrawerHeight(height: number, viewportHeight: number) {
	return Math.min(
		viewportHeight,
		Math.max(drawerMinimumHeight(viewportHeight), height),
	);
}

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
	const [drawerHeight, setDrawerHeight] = useState(0);
	const dragStart = useRef<{
		pointerId: number;
		startHeight: number;
		startY: number;
	} | null>(null);
	useEffect(() => {
		if (!isMobile || !open) return;
		const resetHeight = () =>
			setDrawerHeight(drawerInitialHeight(window.innerHeight));
		resetHeight();
		window.addEventListener("resize", resetHeight);
		return () => window.removeEventListener("resize", resetHeight);
	}, [isMobile, open]);
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
	const drawerMaxHeight =
		typeof window === "undefined" ? 0 : window.innerHeight;
	const drawerValue = drawerHeight || drawerInitialHeight(drawerMaxHeight);
	const resizeDrawer = (height: number) => {
		setDrawerHeight(clampDrawerHeight(height, window.innerHeight));
	};

	if (isMobile)
		return (
			<Sheet onOpenChange={onOpenChange} open={open}>
				<SheetContent
					className="max-h-dvh min-h-[72dvh] overflow-y-auto rounded-t-2xl px-6 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
					side="bottom"
					style={{ height: `${drawerValue}px` }}
				>
					<div
						aria-label="Ajustar altura do drawer"
						aria-valuemax={drawerMaxHeight}
						aria-valuemin={drawerMinimumHeight(drawerMaxHeight)}
						aria-valuenow={drawerValue}
						className="mx-auto flex h-8 w-16 touch-none cursor-ns-resize items-center justify-center"
						onKeyDown={(event) => {
							if (event.key === "ArrowUp") {
								event.preventDefault();
								resizeDrawer(drawerValue + 64);
							}
							if (event.key === "ArrowDown") {
								event.preventDefault();
								resizeDrawer(drawerValue - 64);
							}
						}}
						onPointerDown={(event) => {
							event.currentTarget.setPointerCapture(event.pointerId);
							dragStart.current = {
								pointerId: event.pointerId,
								startHeight: drawerValue,
								startY: event.clientY,
							};
						}}
						onPointerMove={(event) => {
							const start = dragStart.current;
							if (!start || start.pointerId !== event.pointerId) return;
							resizeDrawer(start.startHeight + start.startY - event.clientY);
						}}
						onPointerUp={(event) => {
							if (dragStart.current?.pointerId !== event.pointerId) return;
							event.currentTarget.releasePointerCapture(event.pointerId);
							dragStart.current = null;
						}}
						role="slider"
						tabIndex={0}
					>
						<span className="h-1.5 w-12 rounded-full bg-muted" />
					</div>
					<SheetHeader className="p-0 text-left">
						<SheetTitle>Detalhes do lançamento</SheetTitle>
						<SheetDescription>{description}</SheetDescription>
					</SheetHeader>
					{details}
					{editAction && (
						<SheetFooter className="p-0 pt-2">{editAction}</SheetFooter>
					)}
				</SheetContent>
			</Sheet>
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
