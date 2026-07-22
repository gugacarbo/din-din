import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { AdminAuthError, noStore, sameOrigin } from "#/server/admin-auth.ts";
import {
	AdminSupportError,
	publishAdminSupport,
} from "#/server/admin-support-service.ts";

export const Route = createFileRoute("/api/admin/support/$reportId/publish")({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				if (!sameOrigin(request))
					return Response.json(
						{ code: "forbidden" },
						{ status: 403, headers: noStore },
					);
				try {
					return Response.json(
						await publishAdminSupport(
							env.DB,
							request.headers,
							params.reportId,
							await request.json(),
							{ ...env, appSecret: env.APP_SECRET },
						),
						{ headers: noStore },
					);
				} catch (error) {
					const status =
						error instanceof AdminAuthError ||
						error instanceof AdminSupportError
							? error.status
							: 400;
					return Response.json(
						{ code: error instanceof Error ? error.message : "publish_failed" },
						{ status, headers: noStore },
					);
				}
			},
		},
	},
});
