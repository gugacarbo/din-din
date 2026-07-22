import {
	FinanceError,
	createFinanceService,
	financeSchemas,
} from "#/server/finance-service";
import { consumeSupportQueue } from "#/server/support-queue.ts";

const dashboardPath = "/__test/finance/dashboard";
const reportPath = "/__test/finance/report";

function json(value: unknown, status = 200) {
	return Response.json(value, { status });
}

function hasOnly(search: URLSearchParams, names: string[]) {
	return [...search.keys()].every((key) => names.includes(key));
}

/** Test-only HTTP harness executed exclusively by the Workers Vitest pool. */
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname !== dashboardPath && url.pathname !== reportPath)
			return new Response("Not found", { status: 404 });
		if (request.method !== "GET")
			return new Response("Method not allowed", { status: 405 });
		if (
			(url.pathname === dashboardPath && [...url.searchParams].length > 0) ||
			(url.pathname === reportPath &&
				!hasOnly(url.searchParams, ["granularity", "anchorDate"]))
		)
			return new Response("Invalid query", { status: 400 });

		try {
			const service = createFinanceService({
				d1: env.DB,
				headers: request.headers,
			});
			if (url.pathname === dashboardPath) return json(await service.getDashboard());
			const parsed = financeSchemas.report.safeParse({
				granularity: url.searchParams.get("granularity"),
				anchorDate: url.searchParams.get("anchorDate"),
			});
			if (!parsed.success) return new Response("Invalid report", { status: 400 });
			return json(await service.getReport(parsed.data));
		} catch (error) {
			if (error instanceof FinanceError)
				return json(
					{ code: error.code, message: error.message },
					error.code === "UNAUTHENTICATED" ? 401 : 400,
				);
			throw error;
		}
	},
	async queue(batch, env) {
		await consumeSupportQueue(
			batch,
			Object.assign(env, {
				AI: {
					run: async () => {
						throw new Error("test transient AI failure");
					},
				},
			}) as Env,
		);
	},
} satisfies ExportedHandler<Env>;
