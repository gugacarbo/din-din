import { createFileRoute } from "@tanstack/react-router";
import { FinancePage } from "#/components/finance/finance-page.tsx";
import { categoriesQueryOptions } from "#/lib/finance-query-options.ts";
import { requireFinanceSession } from "#/lib/route-session.ts";
export const Route = createFileRoute("/categories")({
	beforeLoad: ({ context }) => requireFinanceSession(context.queryClient),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(categoriesQueryOptions("active")),
	component: () => <FinancePage kind="categories" />,
});
