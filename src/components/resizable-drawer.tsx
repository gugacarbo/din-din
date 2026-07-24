import {
	type ComponentProps,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";

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
	Math.round(viewportHeight * 0.72);
const drawerMinimumHeight = (viewportHeight: number) =>
	Math.round(viewportHeight * 0.72);
const drawerCloseThreshold = (viewportHeight: number) =>
	Math.max(180, Math.round(viewportHeight * 0.28));
const drawerDragThreshold = 8;

function clampDrawerHeight(height: number, viewportHeight: number) {
	return Math.min(
		viewportHeight,
		Math.max(drawerMinimumHeight(viewportHeight), height),
	);
}

function ResizableDrawer({
	children,
	className,
	contentProps,
	description,
	footer,
	onOpenChange,
	open,
	title,
}: {
	children: ReactNode;
	className?: string;
	contentProps?: Omit<
		ComponentProps<typeof SheetContent>,
		"children" | "className" | "side"
	> & { [key: `data-${string}`]: boolean | string | undefined };
	description: ReactNode;
	footer?: ReactNode;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	title: ReactNode;
}) {
	const [drawerHeight, setDrawerHeight] = useState(0);
	const dragStart = useRef<{
		dragging: boolean;
		pointerId: number;
		scrollTop: number;
		startHeight: number;
		startY: number;
	} | null>(null);
	const drawerMaxHeight =
		typeof window === "undefined" ? 0 : window.innerHeight;
	const drawerValue = drawerHeight || drawerInitialHeight(drawerMaxHeight);
	const canScroll = drawerValue >= drawerMaxHeight;

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
				{...contentProps}
			>
				<div
					className={cn(
						"min-h-0 flex-1 touch-pan-x touch-pinch-zoom overflow-x-hidden",
						canScroll ? "overflow-y-auto" : "overflow-y-hidden",
					)}
					onPointerCancel={() => {
						dragStart.current = null;
					}}
					onPointerDown={(event) => {
						dragStart.current = {
							dragging: false,
							pointerId: event.pointerId,
							scrollTop: event.currentTarget.scrollTop,
							startHeight: drawerValue,
							startY: event.clientY,
						};
					}}
					onPointerMove={(event) => {
						const start = dragStart.current;
						if (!start || start.pointerId !== event.pointerId) return;
						const deltaY = event.clientY - start.startY;
						if (!start.dragging) {
							if (Math.abs(deltaY) < drawerDragThreshold) return;
							start.dragging = true;
							event.currentTarget.setPointerCapture(event.pointerId);
						}
						event.preventDefault();
						if (start.startHeight >= drawerMaxHeight && deltaY < 0) {
							event.currentTarget.scrollTop = start.scrollTop - deltaY;
							return;
						}
						const scrollDistance = Math.min(
							start.scrollTop,
							Math.max(0, deltaY),
						);
						event.currentTarget.scrollTop = start.scrollTop - scrollDistance;
						resizeDrawer(start.startHeight - (deltaY - scrollDistance));
					}}
					onPointerUp={(event) => {
						const start = dragStart.current;
						if (!start || start.pointerId !== event.pointerId) return;
						if (event.currentTarget.hasPointerCapture(event.pointerId))
							event.currentTarget.releasePointerCapture(event.pointerId);
						dragStart.current = null;
						if (!start.dragging) return;
						const effectiveDownwardDistance =
							event.clientY - start.startY - start.scrollTop;
						if (
							effectiveDownwardDistance >= drawerCloseThreshold(drawerMaxHeight)
						) {
							onOpenChange(false);
						}
					}}
					onWheel={(event) => {
						if (canScroll || event.deltaY === 0) return;
						event.preventDefault();
						if (event.deltaY < 0) {
							resizeDrawer(drawerValue + Math.abs(event.deltaY));
							return;
						}
						const height = drawerValue - event.deltaY;
						resizeDrawer(height);
					}}
				>
					<div className="flex min-h-full flex-col">
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
							role="slider"
							tabIndex={0}
						>
							<span className="h-1.5 w-12 rounded-full bg-muted" />
						</div>
						<SheetHeader className="p-0 text-left">
							<SheetTitle>{title}</SheetTitle>
							<SheetDescription>{description}</SheetDescription>
						</SheetHeader>
						<div className="flex-1">{children}</div>
					</div>
				</div>
				{footer && <SheetFooter className="p-0 pt-2">{footer}</SheetFooter>}
			</SheetContent>
		</Sheet>
	);
}

export { ResizableDrawer };
