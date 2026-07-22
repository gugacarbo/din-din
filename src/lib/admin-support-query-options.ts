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
					safe_reason: string | null;
					created_at: number;
				}>;
				nextCursor: string | null;
			}>;
		},
	});
