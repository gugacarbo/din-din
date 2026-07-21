import { queryOptions } from "@tanstack/react-query";

import { getSessionUser } from "#/server/finance.ts";

export const financeQueryKey = ["finance"] as const;

export const sessionQueryOptions = () =>
	queryOptions({
		queryKey: [...financeQueryKey, "session"],
		queryFn: getSessionUser,
	});
