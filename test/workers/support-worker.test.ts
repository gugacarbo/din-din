import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const safeModel = {
	title: "Falha ao salvar lançamento",
	summary: "Uma ação não conclui o salvamento.",
	technicalCategory: "bug",
	observedBehavior: "O registro não é concluído.",
	probableSteps: ["Abrir lançamentos"],
	technicalSignals: ["Erro de rede agregado"],
	labels: ["bug"],
};

afterEach(() => {
	vi.unstubAllGlobals();
});

async function privateKey() {
	const pair = await crypto.subtle.generateKey(
		{
			name: "RSASSA-PKCS1-v1_5",
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["sign", "verify"],
	);
	const encoded = btoa(
		String.fromCharCode(
			...new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
		),
	);
	return `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----`;
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

	it("does not acknowledge a terminal transient retry before Queue can dead-letter it", async () => {
		const reportId = await report();
		const runtimeEnv = runtime({
			AI: { run: vi.fn().mockRejectedValue(new Error("temporary AI failure")) },
		});
		const terminal = message({ kind: "triage", reportId }, 3);
		await worker.queue?.(
			batch("din-din-support-reports", [terminal]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		expect(terminal.retry).toHaveBeenCalledTimes(1);
		expect(terminal.ack).not.toHaveBeenCalled();
	});

	it("keeps one GitHub publication while an AI call outlives its lease", async () => {
		const reportId = await report();
		let releaseFirstAi: (value: { response: string }) => void = () => undefined;
		const ai = {
			run: vi
				.fn()
				.mockReturnValueOnce(
					new Promise<{ response: string }>((resolve) => {
						releaseFirstAi = resolve;
					}),
				)
				.mockResolvedValueOnce({ response: JSON.stringify(safeModel) }),
		};
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("access_tokens")) return Response.json({ token: "token" });
			if (url.includes("/search/issues")) return Response.json({ items: [] });
			return Response.json({ number: 17, html_url: "https://github.com/gugacarbo/din-din/issues/17" });
		});
		vi.stubGlobal("fetch", fetcher);
		const runtimeEnv = runtime({
			AI: ai,
			GITHUB_APP_ID: "1",
			GITHUB_APP_INSTALLATION_ID: "2",
			GITHUB_APP_PRIVATE_KEY: await privateKey(),
		});
		const slow = message({ kind: "triage", reportId });
		const firstRun = worker.queue?.(
			batch("din-din-support-reports", [slow]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		await vi.waitFor(() => expect(ai.run).toHaveBeenCalledTimes(1));
		await env.DB.prepare(
			"update support_reports set lease_expires_at = ? where report_id = ?",
		)
			.bind(Date.now() - 1, reportId)
			.run();
		const recovered = message({ kind: "triage", reportId });
		await worker.queue?.(
			batch("din-din-support-reports", [recovered]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		await vi.waitFor(() =>
			expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/issues"))).toHaveLength(1),
		);
		releaseFirstAi({ response: JSON.stringify(safeModel) });
		await firstRun;
		expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/issues"))).toHaveLength(1);
	});

	it("keeps the durable publication reservation while GitHub outlives its lease", async () => {
		const reportId = await report();
		let releasePost: (value: Response) => void = () => undefined;
		const fetcher = vi.fn((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("access_tokens")) return Promise.resolve(Response.json({ token: "token" }));
			if (url.includes("/search/issues")) return Promise.resolve(Response.json({ items: [] }));
			return new Promise<Response>((resolve) => {
				releasePost = resolve;
			});
		});
		vi.stubGlobal("fetch", fetcher);
		const runtimeEnv = runtime({
			AI: { run: vi.fn().mockResolvedValue({ response: JSON.stringify(safeModel) }) },
			GITHUB_APP_ID: "1",
			GITHUB_APP_INSTALLATION_ID: "2",
			GITHUB_APP_PRIVATE_KEY: await privateKey(),
		});
		const first = message({ kind: "triage", reportId });
		const firstRun = worker.queue?.(
			batch("din-din-support-reports", [first]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		await vi.waitFor(() =>
			expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/issues"))).toHaveLength(1),
		);
		await env.DB.prepare(
			"update support_reports set lease_expires_at = ? where report_id = ?",
		)
			.bind(Date.now() - 1, reportId)
			.run();
		const duplicate = message({ kind: "triage", reportId });
		await worker.queue?.(
			batch("din-din-support-reports", [duplicate]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/issues"))).toHaveLength(1);
		expect(duplicate.ack).toHaveBeenCalledTimes(1);
		releasePost(
			Response.json({
				number: 18,
				html_url: "https://github.com/gugacarbo/din-din/issues/18",
			}),
		);
		await firstRun;
	});

	it("turns a redelivery after a pre-POST reservation into manual review", async () => {
		const reportId = await report();
		const publicationToken = crypto.randomUUID();
		await env.DB.prepare(
			"update support_reports set status = 'processing', publication_token = ?, publication_reserved_at = ?, lease_expires_at = ? where report_id = ?",
		)
			.bind(publicationToken, Date.now() - 1, Date.now() - 1, reportId)
			.run();
		const runtimeEnv = runtime();
		const redelivery = message({ kind: "triage", reportId });
		await worker.queue?.(
			batch("din-din-support-reports", [redelivery]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		expect(redelivery.ack).toHaveBeenCalledTimes(1);
		expect(runtimeEnv.AI.run).not.toHaveBeenCalled();
		expect(runtimeEnv.SUPPORT_REPORTS_DLQ.send).toHaveBeenCalledWith({
			kind: "manual_review",
			reportId,
			eventId: `manual:${reportId}:publication_reservation_ambiguous`,
		});
		const row = await env.DB
			.prepare(
				"select status, safe_reason, publication_token from support_reports where report_id = ?",
			)
			.bind(reportId)
			.first<{
				status: string;
				safe_reason: string;
				publication_token: string | null;
			}>();
		expect(row).toEqual({
			status: "manual_review",
			safe_reason: "publication_reservation_ambiguous",
			publication_token: null,
		});
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
		const task = await env.DB
			.prepare(
				"select kind, reason, status from support_review_tasks where report_id = ?",
			)
			.bind(reportId)
			.first<{ kind: string; reason: string; status: string }>();
		expect(task).toEqual({
			kind: "transient_failure",
			reason: "transient_retries_exhausted",
			status: "observed",
		});
	});

	it("keeps a published issue intact when an old triage envelope reaches the DLQ", async () => {
		const reportId = await report({ status: "published" });
		await env.DB
			.prepare(
				"update support_reports set issue_number = ?, issue_url = ?, safe_reason = null where report_id = ?",
			)
			.bind(31, "https://github.com/gugacarbo/din-din/issues/31", reportId)
			.run();
		const runtimeEnv = runtime();
		const old = message({ kind: "triage", reportId });
		const duplicate = message({ kind: "triage", reportId });
		await worker.queue?.(
			batch("din-din-support-reports-dlq", [old]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		await worker.queue?.(
			batch("din-din-support-reports-dlq", [duplicate]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		expect(old.ack).toHaveBeenCalledTimes(1);
		expect(duplicate.ack).toHaveBeenCalledTimes(1);
		const row = await env.DB
			.prepare(
				"select status, issue_number, issue_url, safe_reason from support_reports where report_id = ?",
			)
			.bind(reportId)
			.first<{
				status: string;
				issue_number: number;
				issue_url: string;
				safe_reason: string | null;
			}>();
		expect(row).toEqual({
			status: "published",
			issue_number: 31,
			issue_url: "https://github.com/gugacarbo/din-din/issues/31",
			safe_reason: null,
		});
		expect(
			await env.DB
				.prepare("select count(*) as count from support_review_tasks where report_id = ?")
				.bind(reportId)
				.first<{ count: number }>(),
		).toEqual({ count: 0 });
	});

	it("does not reclassify other terminal or active reports from an old DLQ envelope", async () => {
		const manual = await report({ status: "manual_review" });
		const failed = await report({ status: "failed" });
		const active = await report({ status: "processing" });
		const reserved = await report({ status: "processing" });
		await env.DB.batch([
			env.DB
				.prepare("update support_reports set safe_reason = ? where report_id = ?")
				.bind("invalid_ai_output", manual),
			env.DB
				.prepare("update support_reports set safe_reason = ? where report_id = ?")
				.bind("another_failure", failed),
			env.DB
				.prepare(
					"update support_reports set lease_expires_at = ? where report_id = ?",
				)
				.bind(Date.now() + 60_000, active),
			env.DB
				.prepare(
					"update support_reports set publication_token = ?, publication_reserved_at = ?, lease_expires_at = ? where report_id = ?",
				)
				.bind(crypto.randomUUID(), Date.now(), Date.now() - 1, reserved),
		]);
		const runtimeEnv = runtime();
		const messages = [manual, failed, active, reserved].map((reportId) =>
			message({ kind: "triage", reportId }),
		);
		await worker.queue?.(
			batch("din-din-support-reports-dlq", messages),
			runtimeEnv,
			{} as ExecutionContext,
		);
		for (const event of messages) expect(event.ack).toHaveBeenCalledTimes(1);
		const rows = await env.DB
			.prepare(
				"select report_id, status, safe_reason, publication_token from support_reports where report_id in (?, ?, ?, ?) order by report_id",
			)
			.bind(active, failed, manual, reserved)
			.all<{
				report_id: string;
				status: string;
				safe_reason: string | null;
				publication_token: string | null;
			}>();
		const byReport = new Map(rows.results.map((row) => [row.report_id, row]));
		expect(byReport.get(manual)).toMatchObject({
			status: "manual_review",
			safe_reason: "invalid_ai_output",
		});
		expect(byReport.get(failed)).toMatchObject({
			status: "failed",
			safe_reason: "another_failure",
		});
		expect(byReport.get(active)).toMatchObject({
			status: "processing",
			publication_token: null,
		});
		expect(byReport.get(reserved)).toMatchObject({ status: "processing" });
		expect(byReport.get(reserved)?.publication_token).toBeTruthy();
		expect(
			await env.DB
				.prepare(
					"select count(*) as count from support_review_tasks where report_id in (?, ?, ?, ?)",
				)
				.bind(manual, failed, active, reserved)
				.first<{ count: number }>(),
		).toEqual({ count: 0 });
	});

	it("records one failure task for duplicate DLQ deliveries and stale processing", async () => {
		const reportId = await report({ status: "processing" });
		await env.DB
			.prepare(
				"update support_reports set lease_expires_at = ?, publication_token = null where report_id = ?",
			)
			.bind(Date.now() - 1, reportId)
			.run();
		const runtimeEnv = runtime();
		const first = message({ kind: "triage", reportId });
		const duplicate = message({ kind: "triage", reportId });
		await worker.queue?.(
			batch("din-din-support-reports-dlq", [first]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		await worker.queue?.(
			batch("din-din-support-reports-dlq", [duplicate]),
			runtimeEnv,
			{} as ExecutionContext,
		);
		expect(first.ack).toHaveBeenCalledTimes(1);
		expect(duplicate.ack).toHaveBeenCalledTimes(1);
		expect(
			await env.DB
				.prepare("select status, safe_reason from support_reports where report_id = ?")
				.bind(reportId)
				.first<{ status: string; safe_reason: string }>(),
		).toEqual({ status: "failed", safe_reason: "transient_retries_exhausted" });
		expect(
			await env.DB
				.prepare("select count(*) as count from support_review_tasks where report_id = ?")
				.bind(reportId)
				.first<{ count: number }>(),
		).toEqual({ count: 1 });
	});

	it("delivers an exhausted triage envelope through the configured DLQ", async () => {
		const reportId = await report();
		await env.SUPPORT_REPORTS_QUEUE.send({ kind: "triage", reportId });
		await vi.waitFor(
			async () => {
				const row = await env.DB.prepare(
					"select status, safe_reason from support_reports where report_id = ?",
				)
					.bind(reportId)
					.first<{ status: string; safe_reason: string }>();
				expect(row).toEqual({
					status: "failed",
					safe_reason: "transient_retries_exhausted",
				});
			},
			{ timeout: 10_000 },
		);
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

	it("continues retention cleanup when one pending outbox delivery fails", async () => {
		const reportId = await report({ expiresAt: Date.now() - 1 });
		const eventId = `manual:${reportId}:unavailable`;
		await env.DB
			.prepare(
				"insert into support_review_tasks (event_id, report_id, kind, reason, status, created_at, updated_at) values (?, ?, 'manual_review', 'test', 'pending', ?, ?)",
			)
			.bind(eventId, reportId, Date.now(), Date.now())
			.run();
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const runtimeEnv = runtime({
			SUPPORT_REPORTS_DLQ: {
				send: vi.fn().mockRejectedValue(new Error("dlq unavailable")),
			},
		});
		const work: Promise<unknown>[] = [];
		await worker.scheduled?.(
			{} as ScheduledController,
			runtimeEnv,
			{ waitUntil(promise) { work.push(promise); } } as ExecutionContext,
		);
		await Promise.all(work);
		expect(runtimeEnv.SUPPORT_SCREENSHOTS.delete).toHaveBeenCalledWith(
			"support/test/viewport.webp",
		);
		expect(
			await env.DB
				.prepare("select report_id from support_report_payloads where report_id = ?")
				.bind(reportId)
				.first(),
		).toBeNull();
		expect(
			await env.DB
				.prepare("select status from support_review_tasks where event_id = ?")
				.bind(eventId)
				.first<{ status: string }>(),
		).toEqual({ status: "pending" });
		expect(error).toHaveBeenCalledWith(
			JSON.stringify({
				event: "support_dlq_outbox_pending",
				reportId,
				eventId,
			}),
		);
	});
});
