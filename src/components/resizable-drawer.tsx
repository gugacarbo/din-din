import { type ReactNode, useEffect, useRef, useState } from "react";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet.tsx";
import { cn } from "#/lib/utils.ts";

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

function ResizableDrawer({
	children,
	className,
	description,
	footer,
	onOpenChange,
	open,
	title,
}: {
	children: ReactNode;
	className?: string;
	description: ReactNode;
	footer?: ReactNode;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	title: ReactNode;
}) {
	const [drawerHeight, setDrawerHeight] = useState(0);
	const dragStart = useRef<{
		pointerId: number;
		startHeight: number;
		startY: number;
	} | null>(null);
	const drawerMaxHeight =
		typeof window === "undefined" ? 0 : window.innerHeight;
	const drawerValue = drawerHeight || drawerInitialHeight(drawerMaxHeight);

	useEffect(() => {
		if (!open) return;
		const resetHeight = () =>
			setDrawerHeight(drawerInitialHeight(window.innerHeight));
		resetHeight();
		window.addEventListener("resize", resetHeight);
		return () => window.removeEventListener("resize", resetHeight);
	}, [open]);

	const resizeDrawer = (height: number) => {
		setDrawerHeight(clampDrawerHeight(height, window.innerHeight));
	};

	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent
				className={cn(
					"max-h-dvh min-h-[72dvh] overflow-hidden rounded-t-2xl px-6 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
					className,
				)}
				side="bottom"
				style={{ height: `${drawerValue}px` }}
			>
				<div
					aria-label="Ajustar altura do drawer"
					aria-valuemax={drawerMaxHeight}
					aria-valuemin={drawerMinimumHeight(drawerMaxHeight)}
					aria-valuenow={drawerValue}
					className="mx-auto flex h-10 w-16 touch-none cursor-ns-resize items-center justify-center"
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
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>{description}</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
				{footer && <SheetFooter className="p-0 pt-2">{footer}</SheetFooter>}
			</SheetContent>
		</Sheet>
	);
}

export { ResizableDrawer };
