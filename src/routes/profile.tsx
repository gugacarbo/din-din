import { createFileRoute } from "@tanstack/react-router";

import { FinancePage } from "#/components/finance/finance-page.tsx";
import { requireFinanceSession } from "#/lib/route-session.ts";

export const Route = createFileRoute("/profile")({
	beforeLoad: ({ context }) => requireFinanceSession(context.queryClient),
	component: () => <FinancePage kind="profile" />,
});
