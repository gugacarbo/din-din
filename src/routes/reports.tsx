import { createFileRoute } from "@tanstack/react-router";
import { FinancePage } from "#/components/finance/finance-page.tsx";
import { reportQueryOptions } from "#/lib/finance-query-options.ts";
import { requireFinanceSession } from "#/lib/route-session.ts";
export const Route = createFileRoute("/reports")({
	beforeLoad: ({ context }) => requireFinanceSession(context.queryClient),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(reportQueryOptions()),
	component: () => <FinancePage kind="reports" />,
});
