import type { ReactNode } from "react";

export function AsyncDataState({
	children,
	error,
	errorFallback,
	hasData,
	pending,
	pendingFallback,
}: {
	children: ReactNode | (() => ReactNode);
	error: unknown;
	errorFallback: (error: unknown) => ReactNode;
	hasData: boolean;
	pending: boolean;
	pendingFallback: ReactNode;
}) {
	if (pending && !hasData) return pendingFallback;
	if (!hasData) return errorFallback(error);
	return (
		<>
			{error ? errorFallback(error) : null}
			{typeof children === "function" ? children() : children}
		</>
	);
}
