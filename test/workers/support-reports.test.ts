import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { createAuthedPair } from "./fixtures.ts";
import { acceptSupportReport } from "#/server/support-service.ts";

function payload(requestId = crypto.randomUUID()) {
	return {
		category: "problem",
		message: "Falha ao salvar lançamento",
		clientRequestId: requestId,
		diagnostics: {
			console: [],
			requests: [],
			route: "/transactions",
			viewport: { width: 1280, height: 800 },
			online: true,
			browser: "test",
		},
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
});
