import { createFileRoute } from "@tanstack/react-router";
import { FinancePage } from "#/components/finance/finance-page.tsx";
import { activityQueryOptions } from "#/lib/finance-query-options.ts";
import { requireFinanceSession } from "#/lib/route-session.ts";
export const Route = createFileRoute("/transactions")({
	beforeLoad: ({ context }) => requireFinanceSession(context.queryClient),
	loader: ({ context }) =>
		context.queryClient.ensureInfiniteQueryData(activityQueryOptions()),
	component: () => <FinancePage kind="transactions" />,
});
