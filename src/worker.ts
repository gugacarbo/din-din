import start from "@tanstack/react-start/server-entry";
import {
	consumeSupportQueue,
	scheduledSupportMaintenance,
} from "#/server/support-queue.ts";

export default {
	async fetch(request) {
		return start.fetch(request);
	},
	async queue(batch, env) {
		await consumeSupportQueue(batch, env);
	},
	async scheduled(_controller, env, ctx) {
		ctx.waitUntil(scheduledSupportMaintenance(env));
	},
} satisfies ExportedHandler<Env>;
