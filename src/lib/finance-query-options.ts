import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { saoPauloToday } from "#/lib/finance.ts";
import {
	getDashboard,
	getReport,
	getSessionUser,
	listCategories,
	listInvoices,
	listPaymentMethods,
	listTransactions,
} from "#/server/finance.ts";

export const financeQueryKey = ["finance"] as const;
const sidebarPrefetchStaleTime = 30_000;

export const sessionQueryOptions = () =>
	queryOptions({
		queryKey: [...financeQueryKey, "session"],
		queryFn: getSessionUser,
	});

export const dashboardQueryOptions = () =>
	queryOptions({
		queryKey: [...financeQueryKey, "dashboard"],
		queryFn: getDashboard,
		staleTime: sidebarPrefetchStaleTime,
	});

export const categoriesQueryOptions = (status: "active" | "archived") =>
	queryOptions({
		queryKey: [...financeQueryKey, "categories", status],
		queryFn: () => listCategories({ data: { status } }),
		staleTime: sidebarPrefetchStaleTime,
	});

export const paymentMethodsQueryOptions = () =>
	queryOptions({
		queryKey: [...financeQueryKey, "payment-methods", "all"],
		queryFn: () => listPaymentMethods({ data: { status: "all" } }),
		staleTime: sidebarPrefetchStaleTime,
	});

export const invoicesQueryOptions = () =>
	queryOptions({
		queryKey: [...financeQueryKey, "invoices"],
		queryFn: listInvoices,
		staleTime: sidebarPrefetchStaleTime,
	});

export const transactionsQueryOptions = (scope: "active" | "archived") =>
	infiniteQueryOptions({
		queryKey: [...financeQueryKey, "transactions", scope],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			listTransactions({
				data: pageParam ? { scope, cursor: pageParam } : { scope },
			}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: sidebarPrefetchStaleTime,
	});

export const reportQueryOptions = (
	granularity: "day" | "week" | "month" = "month",
	anchorDate = saoPauloToday(),
) =>
	queryOptions({
		queryKey: [...financeQueryKey, "report", granularity, anchorDate],
		queryFn: () => getReport({ data: { granularity, anchorDate } }),
		staleTime: sidebarPrefetchStaleTime,
	});
