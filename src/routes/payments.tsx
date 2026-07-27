import { createFileRoute } from "@tanstack/react-router";

import { FinancePage } from "#/components/finance/finance-page.tsx";
import {
	invoicesQueryOptions,
	paymentMethodsQueryOptions,
} from "#/lib/finance-query-options.ts";
import { requireFinanceSession } from "#/lib/route-session.ts";

export const Route = createFileRoute("/payments")({
	beforeLoad: ({ context }) => requireFinanceSession(context.queryClient),
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(paymentMethodsQueryOptions()),
			context.queryClient.ensureInfiniteQueryData(invoicesQueryOptions()),
		]),
	component: () => <FinancePage kind="payments" />,
});
