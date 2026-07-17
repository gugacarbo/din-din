import { createFileRoute, redirect } from "@tanstack/react-router";
import { FinancePage } from "#/components/finance/finance-page.tsx";
import { getSessionUser } from "#/server/finance.ts";
export const Route = createFileRoute("/reports")({
	beforeLoad: async () => {
		try {
			await getSessionUser();
		} catch {
			throw redirect({ to: "/login" });
		}
	},
	component: () => <FinancePage kind="reports" />,
});
