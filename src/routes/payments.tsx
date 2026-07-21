import { createFileRoute, redirect } from "@tanstack/react-router";

import { FinancePage } from "#/components/finance/finance-page.tsx";
import { sessionQueryOptions } from "#/lib/finance-query-options.ts";

export const Route = createFileRoute("/payments")({
	beforeLoad: async ({ context }) => {
		try {
			await context.queryClient.ensureQueryData(sessionQueryOptions());
		} catch {
			throw redirect({ to: "/login" });
		}
	},
	component: () => <FinancePage kind="payments" />,
});
