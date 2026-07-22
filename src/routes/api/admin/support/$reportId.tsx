import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { AdminAuthError, noStore } from "#/server/admin-auth.ts";
import {
	AdminSupportError,
	adminSupportDetail,
} from "#/server/admin-support-service.ts";

export const Route = createFileRoute("/api/admin/support/$reportId")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				try {
					return Response.json(
						await adminSupportDetail(env.DB, request.headers, params.reportId),
						{ headers: noStore },
					);
				} catch (error) {
					const status =
						error instanceof AdminAuthError ||
						error instanceof AdminSupportError
							? error.status
							: 400;
					return Response.json(
						{ code: error instanceof Error ? error.message : "forbidden" },
						{ status, headers: noStore },
					);
				}
			},
		},
	},
});
