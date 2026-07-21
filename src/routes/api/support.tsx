import { env as runtime } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createSupportHandler } from "#/server/support-service.ts";

export const Route = createFileRoute("/api/support")({
	server: {
		handlers: {
			POST: ({ request }) =>
				createSupportHandler(request, {
					d1: runtime.DB,
					screenshots: runtime.SUPPORT_SCREENSHOTS,
					queue: runtime.SUPPORT_REPORTS_QUEUE,
				}),
		},
	},
});
