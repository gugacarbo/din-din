import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "#/server/admin-auth.ts";

export const Route = createFileRoute("/api/admin/membership")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					await requireAdmin(env.DB, request.headers);
					return Response.json(
						{ isAdmin: true },
						{ headers: { "cache-control": "no-store" } },
					);
				} catch {
					return Response.json(
						{ isAdmin: false },
						{ status: 403, headers: { "cache-control": "no-store" } },
					);
				}
			},
		},
	},
});
