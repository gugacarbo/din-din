import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { sessionQueryOptions } from "./finance-query-options.ts";
import { isOfflineNavigation } from "./pwa.ts";

export async function requireFinanceSession(queryClient: QueryClient) {
	if (isOfflineNavigation()) return;
	try {
		await queryClient.ensureQueryData(sessionQueryOptions());
	} catch {
		throw redirect({ to: "/login" });
	}
}
