import { queryOptions } from "@tanstack/react-query";
export const adminMembershipQueryOptions = () =>
	queryOptions({
		queryKey: ["admin", "membership"],
		queryFn: async () => {
			const response = await fetch("/api/admin/membership");
			return { isAdmin: response.ok };
		},
		staleTime: 30_000,
	});

export const adminSupportQueryOptions = () =>
	queryOptions({
		queryKey: ["admin", "support"],
		queryFn: async () => {
			const response = await fetch("/api/admin/support");
			if (!response.ok)
				throw new Error("Não foi possível carregar os relatos.");
			return response.json() as Promise<{
				items: Array<{
					report_id: string;
					category: string;
					status: string;
					attempts: number;
					safe_reason: string | null;
					created_at: number;
					review_tasks: Array<{
						event_id: string;
						kind: "manual_review" | "transient_failure";
						reason: string;
						status: "pending" | "sent" | "observed";
						created_at: number;
						updated_at: number;
					}>;
				}>;
				nextCursor: string | null;
			}>;
		},
	});
