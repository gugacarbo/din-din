import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { sameOrigin } from "#/server/admin-auth.ts";
import {
	InviteError,
	prepareAdminInvite,
} from "#/server/admin-invite-service.ts";

export const Route = createFileRoute("/api/admin/invite/prepare")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				if (!sameOrigin(request))
					return new Response(null, {
						status: 403,
						headers: { "cache-control": "no-store" },
					});
				try {
					const result = await prepareAdminInvite(
						env.DB,
						await request.json(),
						env.APP_SECRET,
					);
					return Response.json({ ok: true }, { headers: result.headers });
				} catch (error) {
					return Response.json(
						{
							code:
								error instanceof InviteError ? error.message : "invalid_invite",
						},
						{
							status: error instanceof InviteError ? error.status : 400,
							headers: {
								"cache-control": "no-store",
								"referrer-policy": "no-referrer",
							},
						},
					);
				}
			},
		},
	},
});
