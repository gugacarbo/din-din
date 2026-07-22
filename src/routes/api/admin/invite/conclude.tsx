import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { sameOrigin } from "#/server/admin-auth.ts";
import {
	concludeAdminInvite,
	InviteError,
} from "#/server/admin-invite-service.ts";

export const Route = createFileRoute("/api/admin/invite/conclude")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const headers = {
					"cache-control": "no-store",
					"referrer-policy": "no-referrer",
					"set-cookie":
						"din-din-admin-invite=; HttpOnly; Secure; SameSite=Lax; Path=/admin/convite; Max-Age=0",
				};
				if (!sameOrigin(request))
					return new Response(null, { status: 403, headers });
				try {
					const result = await concludeAdminInvite(
						env.DB,
						request,
						env.APP_SECRET,
					);
					return Response.json({ ok: true }, { headers: result.headers });
				} catch (error) {
					return Response.json(
						{
							code:
								error instanceof InviteError
									? error.message
									: "invalid_continuation",
						},
						{
							status: error instanceof InviteError ? error.status : 400,
							headers,
						},
					);
				}
			},
		},
	},
});
