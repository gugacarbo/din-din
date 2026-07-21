import type * as React from "react";

import { Label } from "#/components/ui/label.tsx";
import { cn } from "#/lib/utils.ts";

function Field({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="field"
			className={cn("grid gap-2", className)}
			{...props}
		/>
	);
}

function FieldLabel({
	className,
	...props
}: React.ComponentProps<typeof Label>) {
	return <Label className={cn("data-[invalid=true]:text-destructive", className)} data-slot="field-label" {...props} />;
}

function FieldError({
	className,
	errors,
	children,
	...props
}: React.ComponentProps<"p"> & {
	errors?: Array<{ message?: string }>;
}) {
	const content = children ?? errors?.map((error) => error?.message).filter(Boolean).join(", ");
	if (!content) return null;
	return (
		<p
			aria-live="polite"
			className={cn("text-sm font-medium text-destructive", className)}
			data-slot="field-error"
			role="alert"
			{...props}
		>
			{content}
		</p>
	);
}

export { Field, FieldError, FieldLabel };
