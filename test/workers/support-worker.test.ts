import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

const start = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@tanstack/react-start/server-entry", () => ({ default: start }));

import worker from "#/worker.ts";
import { createAuthedPair } from "./fixtures.ts";

type Event = { ack: ReturnType<typeof vi.fn>; attempts: number; body: unknown; retry: ReturnType<typeof vi.fn> };

function message(body: unknown, attempts = 1): Event {
	return { body, attempts, ack: vi.fn(), retry: vi.fn() };
}

function batch(queue: string, messages: Event[]) {
	return { queue, messages } as unknown as MessageBatch<unknown>;
}

async function report(options?: { expiresAt?: number; status?: string }) {
	const { a } = await createAuthedPair();
	const reportId = crypto.randomUUID();
	const now = Date.now();
	await env.DB.batch([
		env.DB.prepare(
			"insert into support_reports (report_id, category, status, attempts, created_at, updated_at) values (?, 'problem', ?, 0, ?, ?)",
		).bind(reportId, options?.status ?? "queued", now, now),
		env.DB.prepare(
			"insert into support_report_payloads (report_id, user_id, client_request_id, fingerprint, message, diagnostics, metadata, screenshot_key, received_at, expires_at) values (?, ?, ?, 'fingerprint', 'private report', '{}', '{}', 'support/test/viewport.webp', ?, ?)",
		).bind(reportId, a.id, crypto.randomUUID(), now, options?.expiresAt ?? now + 86_400_000),
	]);
	return reportId;
}

function runtime(overrides: Record<string, unknown> = {}) {
	return Object.assign(Object.create(env), {
		AI: { run: vi.fn().mockResolvedValue({ response: "" }) },
		SUPPORT_REPORTS_DLQ: { send: vi.fn().mockResolvedValue({}) },
		SUPPORT_SCREENSHOTS: { delete: vi.fn().mockResolvedValue(undefined) },
		...overrides,
	}) as Env;
}

describe("production support worker", () => {
	it("delegates fetch through the published Worker entry", async () => {
		start.fetch.mockResolvedValueOnce(new Response("ok"));
		const response = await worker.fetch?.(
			new Request("https://example.test/health"),
			runtime(),
			{} as ExecutionContext,
		);
		expect(await response?.text()).toBe("ok");
		expect(start.fetch).toHaveBeenCalledTimes(1);
	});

	it("claims a report once while a concurrent redelivery is acknowledged", async () => {
		const reportId = await report();
		let release: (value: { response: string }) => void = () => undefined;
		const ai = { run: vi.fn().mockReturnValue(new Promise<{ response: string }>((resolve) => { release = resolve; })) };
		const runtimeEnv = runtime({ AI: ai });
		const first = message({ kind: "triage", reportId });
		const duplicate = message({ kind: "triage", reportId });
		const firstRun = worker.queue?.(batch("din-din-support-reports", [first]), runtimeEnv, {} as ExecutionContext);
		await vi.waitFor(() => expect(ai.run).toHaveBeenCalledTimes(1));
		await worker.queue?.(batch("din-din-support-reports", [duplicate]), runtimeEnv, {} as ExecutionContext);
		expect(ai.run).toHaveBeenCalledTimes(1);
		expect(duplicate.ack).toHaveBeenCalledTimes(1);
		release({ response: "not-json" });
		await firstRun;
		expect(first.ack).toHaveBeenCalledTimes(1);
		const row = await env.DB.prepare("select status from support_reports where report_id = ?").bind(reportId).first<{ status: string }>();
		expect(row?.status).toBe("manual_review");
	});

	it("releases a lease and retries only a transient pre-publication failure", async () => {
		const reportId = await report();
		const runtimeEnv = runtime({
			AI: { run: vi.fn().mockRejectedValue(new Error("temporary AI failure")) },
		});
		const transient = message({ kind: "triage", reportId });
		await worker.queue?.(
			batch("din-din-support-reports", [transient]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		expect(transient.retry).toHaveBeenCalledTimes(1);
		expect(transient.ack).not.toHaveBeenCalled();
		const row = await env.DB.prepare(
			"select status, lease_token from support_reports where report_id = ?",
		)
			.bind(reportId)
			.first<{ status: string; lease_token: string | null }>();
		expect(row).toEqual({ status: "queued", lease_token: null });
	});

	it("keeps exhausted triage inside the DLQ without AI, R2, GitHub or a second send", async () => {
		const reportId = await report();
		const runtimeEnv = runtime();
		const dead = message({ kind: "triage", reportId });
		await worker.queue?.(batch("din-din-support-reports-dlq", [dead]), runtimeEnv, {} as ExecutionContext);
		expect(dead.ack).toHaveBeenCalledTimes(1);
		expect(runtimeEnv.AI.run).not.toHaveBeenCalled();
		expect(runtimeEnv.SUPPORT_REPORTS_DLQ.send).not.toHaveBeenCalled();
		expect(runtimeEnv.SUPPORT_SCREENSHOTS.delete).not.toHaveBeenCalled();
		const row = await env.DB.prepare("select status, safe_reason from support_reports where report_id = ?").bind(reportId).first<{ status: string; safe_reason: string }>();
		expect(row).toEqual({ status: "failed", safe_reason: "transient_retries_exhausted" });
	});

	it("runs scheduled outbox and cleanup through the published worker handler", async () => {
		const reportId = await report({ expiresAt: Date.now() - 1 });
		const eventId = `manual:${reportId}:test`;
		await env.DB.prepare(
			"insert into support_review_tasks (event_id, report_id, kind, reason, status, created_at, updated_at) values (?, ?, 'manual_review', 'test', 'pending', ?, ?)",
		).bind(eventId, reportId, Date.now(), Date.now()).run();
		const runtimeEnv = runtime();
		const work: Promise<unknown>[] = [];
		await worker.scheduled?.({} as ScheduledController, runtimeEnv, { waitUntil(promise) { work.push(promise); } } as ExecutionContext);
		await Promise.all(work);
		expect(runtimeEnv.SUPPORT_REPORTS_DLQ.send).toHaveBeenCalledWith({ kind: "manual_review", reportId, eventId });
		expect(runtimeEnv.SUPPORT_SCREENSHOTS.delete).toHaveBeenCalledWith("support/test/viewport.webp");
		const payload = await env.DB.prepare("select report_id from support_report_payloads where report_id = ?").bind(reportId).first();
		expect(payload).toBeNull();
	});
});
