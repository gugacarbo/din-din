import type { ComponentProps, ReactNode } from "react";

import { DialogFooter } from "#/components/ui/dialog.tsx";
import { cn } from "#/lib/utils.ts";

function DrawerFormActions({ children }: { children: ReactNode }) {
	return (
		<div
			className="absolute inset-x-6 bottom-0 z-20 grid grid-cols-2 gap-3 bg-popover pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
			data-slot="drawer-form-actions"
		>
			{children}
		</div>
	);
}

function DrawerAwareForm({
	actions,
	children,
	className,
	mobileDrawer,
	...props
}: Omit<ComponentProps<"form">, "children"> & {
	actions: ReactNode;
	children: ReactNode;
	mobileDrawer: boolean;
}) {
	return (
		<form
			className={cn(
				"grid gap-4",
				mobileDrawer && "h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]",
				className,
			)}
			{...props}
		>
			<div className={cn("grid content-start gap-4", mobileDrawer && "pb-24")}>
				{children}
			</div>
			{mobileDrawer ? (
				<DrawerFormActions>{actions}</DrawerFormActions>
			) : (
				<DialogFooter className="flex-row justify-end">{actions}</DialogFooter>
			)}
		</form>
	);
}

export { DrawerAwareForm };
