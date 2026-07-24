import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { adminMembershipQueryOptions } from "./admin-support-query-options.ts";
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

export async function requireAdminSession(queryClient: QueryClient) {
	await requireFinanceSession(queryClient);
	const membership = await queryClient.ensureQueryData(
		adminMembershipQueryOptions(),
	);
	if (!membership.isAdmin) throw redirect({ to: "/" });
}
