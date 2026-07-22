import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { createAuthedPair } from "./fixtures.ts";
import type { SupportInput } from "#/lib/support.ts";
import { consumeSupportQueue } from "#/server/support-queue.ts";
import { acceptSupportReport } from "#/server/support-service.ts";

function payload(
	requestId = crypto.randomUUID(),
	diagnostics: SupportInput["diagnostics"] = {
		console: [],
		requests: [],
		route: "/transactions",
		viewport: { width: 1280, height: 800 },
		online: true,
		browser: "test",
	},
) {
	return {
		category: "problem",
		message: "Falha ao salvar lançamento",
		clientRequestId: requestId,
		diagnostics,
	};
}

function request(
	value: ReturnType<typeof payload>,
	cookie?: string,
	screenshot?: File,
) {
	const body = new FormData();
	body.set("payload", JSON.stringify(value));
	if (screenshot) body.set("screenshot", screenshot);
	return new Request("https://example.test/api/support", {
		method: "POST",
		headers: cookie ? { cookie } : undefined,
		body,
	});
}

function dependencies() {
	return {
		d1: env.DB,
		screenshots: { put: vi.fn() } as unknown as R2Bucket,
		queue: { send: vi.fn().mockResolvedValue({}) } as unknown as Queue<{
			kind: "triage";
			reportId: string;
		}>,
	};
}

describe("support report intake", () => {
	it("rejects a request without a session before creating a report", async () => {
		const response = await acceptSupportReport(request(payload()), dependencies());
		expect(response.status).toBe(401);
		const rows = await env.DB.prepare("select count(*) as count from support_reports").first<{ count: number }>();
		expect(rows?.count).toBe(0);
	});

	it("persists one opaque report and reuses the same idempotency key", async () => {
		const { a } = await createAuthedPair();
		const input = payload();
		const deps = dependencies();
		const first = await acceptSupportReport(request(input, a.cookieHeader), deps);
		const second = await acceptSupportReport(request(input, a.cookieHeader), deps);
		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(await first.json()).toEqual(await second.json());
		expect(deps.queue.send).toHaveBeenCalledTimes(1);
		const row = await env.DB.prepare("select report_id, status from support_reports order by created_at desc limit 1").first<{ report_id: string; status: string }>();
		expect(row?.status).toBe("queued");
		const privatePayload = await env.DB.prepare("select user_id, message from support_report_payloads where report_id = ?").bind(row?.report_id).first<{ user_id: string; message: string }>();
		expect(privatePayload).toEqual({ user_id: a.id, message: input.message });
	});

	it("retries a pending R2 upload with the same idempotency key before enqueue", async () => {
		const { a } = await createAuthedPair();
		const input = payload();
		const screenshot = new File(["print"], "print.webp", {
			type: "image/webp",
		});
		const put = vi
			.fn()
			.mockRejectedValueOnce(new Error("r2 unavailable"))
			.mockResolvedValueOnce({});
		const deps = {
			d1: env.DB,
			screenshots: { head: vi.fn().mockResolvedValue(null), put } as unknown as R2Bucket,
			queue: { send: vi.fn().mockResolvedValue({}) } as unknown as Queue<{
				kind: "triage";
				reportId: string;
			}>,
		};
		expect(
			(await acceptSupportReport(request(input, a.cookieHeader, screenshot), deps))
				.status,
		).toBe(500);
		expect(
			(await acceptSupportReport(request(input, a.cookieHeader, screenshot), deps))
				.status,
		).toBe(200);
		expect(put).toHaveBeenCalledTimes(2);
		expect(deps.queue.send).toHaveBeenCalledTimes(1);
	});

	it("accepts the largest valid diagnostic snapshot after deterministic truncation", async () => {
		const { a } = await createAuthedPair();
		const input = payload(crypto.randomUUID(), {
			console: Array.from({ length: 50 }, (_, at) => ({
				at,
				level: "error" as const,
				args: [
					"Cookie: session=super-secret-cookie-value",
					...Array.from({ length: 19 }, () => "x".repeat(500)),
				],
			})),
			requests: Array.from({ length: 50 }, (_, at) => ({
				at,
				method: "GET",
				path: "/transactions",
				durationMs: 1,
				result: "success" as const,
			})),
			route: "/transactions",
			viewport: { width: 1280, height: 800 },
			online: true,
			browser: "test",
		});
		const response = await acceptSupportReport(
			request(input, a.cookieHeader),
			dependencies(),
		);
		expect(response.status).toBe(200);
		const stored = await env.DB
			.prepare(
				"select diagnostics from support_report_payloads order by received_at desc limit 1",
			)
			.first<{ diagnostics: string }>();
		expect(new TextEncoder().encode(stored?.diagnostics || "").byteLength).toBeLessThanOrEqual(
			65_536,
		);
		expect(stored?.diagnostics).not.toContain("super-secret-cookie-value");
	});

	it("never forwards textual credentials from intake diagnostics to Workers AI", async () => {
		const { a } = await createAuthedPair();
		const response = await acceptSupportReport(
			request(
				payload(crypto.randomUUID(), {
					console: [
						{
							at: 1,
							level: "error",
							args: [
								"Cookie: session=super-secret-cookie-value Authorization: Basic dXNlcjpwYXNz password=super-secret",
								{
									form: {
										email: "alice@example.test",
										card: "4111111111111111",
										comment: "free form value",
									},
								},
							],
						},
					],
					requests: [
						{
							at: 2,
							method: "POST",
							path: "/transactions?form=private#fragment",
							durationMs: 1,
							result: "success",
						},
					],
					route: "/transactions?token=private#fragment",
					viewport: { width: 1280, height: 800 },
					online: true,
					browser: "browser free form value",
				}),
				a.cookieHeader,
			),
			dependencies(),
		);
		const { reportId } = (await response.json()) as { reportId: string };
		const stored = await env.DB
			.prepare(
				"select diagnostics, metadata from support_report_payloads where report_id = ?",
			)
			.bind(reportId)
			.first<{ diagnostics: string; metadata: string }>();
		const ai = vi.fn().mockResolvedValue({ response: "not-json" });
		const message = {
			body: { kind: "triage", reportId },
			attempts: 1,
			ack: vi.fn(),
			retry: vi.fn(),
		};
		await consumeSupportQueue(
			{ queue: "din-din-support-reports", messages: [message] } as unknown as MessageBatch<unknown>,
			Object.assign(Object.create(env), {
				AI: { run: ai },
				SUPPORT_REPORTS_DLQ: { send: vi.fn().mockResolvedValue({}) },
			}) as Env,
		);
		const prompt = ai.mock.calls[0][1].prompt as string;
		for (const secret of [
			"super-secret-cookie-value",
			"dXNlcjpwYXNz",
			"super-secret",
			"alice@example.test",
			"4111111111111111",
			"free form value",
			"private",
			"fragment",
		]) {
			expect(stored?.diagnostics).not.toContain(secret);
			expect(stored?.metadata).not.toContain(secret);
			expect(prompt).not.toContain(secret);
		}
	});
});
