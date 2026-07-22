import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { AdminAuthError, noStore } from "#/server/admin-auth.ts";
import { listAdminSupport } from "#/server/admin-support-service.ts";

export const Route = createFileRoute("/api/admin/support/")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url);
					return Response.json(
						await listAdminSupport(
							env.DB,
							request.headers,
							url.searchParams.get("cursor") ?? undefined,
							Number(url.searchParams.get("limit") ?? 25),
						),
						{ headers: noStore },
					);
				} catch (error) {
					return Response.json(
						{ code: error instanceof Error ? error.message : "forbidden" },
						{
							status: error instanceof AdminAuthError ? error.status : 400,
							headers: noStore,
						},
					);
				}
			},
		},
	},
});
