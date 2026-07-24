import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import {
	getAdminMembership,
	getAdminSupportDetail,
	getAdminSupportPage,
} from "#/server/admin-support.ts";

export type AdminSupportReviewTask = {
	event_id: string;
	kind: "manual_review" | "transient_failure";
	reason: string;
	status: "pending" | "sent" | "observed";
	created_at: number;
	updated_at: number;
};

export type AdminSupportReport = {
	report_id: string;
	category: string;
	status: string;
	attempts: number;
	safe_reason: string | null;
	issue_number: number | null;
	issue_url: string | null;
	created_at: number;
	review_tasks: AdminSupportReviewTask[];
};

export type AdminSupportDetail = AdminSupportReport & {
	message: string | null;
	canManualPublish: boolean;
	unavailableReason: string | null;
};

export const adminMembershipQueryOptions = () =>
	queryOptions({
		queryKey: ["admin", "membership"],
		queryFn: getAdminMembership,
		staleTime: 30_000,
	});

export const adminSupportQueryOptions = () =>
	infiniteQueryOptions({
		queryKey: ["admin", "support"],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			getAdminSupportPage({
				data: pageParam ? { cursor: pageParam, limit: 25 } : { limit: 25 },
			}) as Promise<{
				items: AdminSupportReport[];
				nextCursor: string | null;
			}>,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	});

export const adminSupportDetailQueryOptions = (reportId: string) =>
	queryOptions({
		queryKey: ["admin", "support", reportId],
		queryFn: () =>
			getAdminSupportDetail({
				data: { reportId },
			}) as Promise<AdminSupportDetail>,
	});
