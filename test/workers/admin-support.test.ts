import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { Route as InviteConcludeRoute } from "#/routes/api/admin/invite/conclude.tsx";
import { Route as InvitePrepareRoute } from "#/routes/api/admin/invite/prepare.tsx";
import { Route as MembershipRoute } from "#/routes/api/admin/membership.tsx";
import { Route as SupportDetailRoute } from "#/routes/api/admin/support/$reportId.tsx";
import { Route as SupportPublishRoute } from "#/routes/api/admin/support/$reportId/publish.tsx";
import { Route as SupportListRoute } from "#/routes/api/admin/support/index.tsx";
import { AdminSupportError, publishAdminSupport } from "#/server/admin-support-service.ts";
import { adminHmac } from "#/lib/admin-invite.ts";
import { concludeAdminInvite, prepareAdminInvite } from "#/server/admin-invite-service.ts";
import { AdminAuthError, requireAdmin, sameOrigin } from "#/server/admin-auth.ts";
import { createAuthedPair } from "./fixtures.ts";

type RouteHandler = (context: {
	request: Request;
	params?: Record<string, string>;
}) => Promise<Response>;

function routeHandler(route: unknown, method: "GET" | "POST") {
	const handler = (route as {
		options: { server: { handlers: Partial<Record<typeof method, RouteHandler>> } };
	}).options.server.handlers[method];
	if (!handler) throw new Error(`Missing ${method} route handler`);
	return handler;
}

function adminRequest(
	path: string,
	userCookie?: string,
	init: RequestInit = {},
) {
	const headers = new Headers(init.headers);
	if (userCookie) headers.set("cookie", userCookie);
	return new Request(`https://test.invalid${path}`, { ...init, headers });
}

const handlers = {
	membership: routeHandler(MembershipRoute, "GET"),
	list: routeHandler(SupportListRoute, "GET"),
	detail: routeHandler(SupportDetailRoute, "GET"),
	publish: routeHandler(SupportPublishRoute, "POST"),
	prepare: routeHandler(InvitePrepareRoute, "POST"),
	conclude: routeHandler(InviteConcludeRoute, "POST"),
};

describe("admin support retention guard", () => {
	it("refuses an expired private payload before reserving or calling GitHub", async () => {
		const { a } = await createAuthedPair();
		const reportId = crypto.randomUUID();
		const now = Date.now();
		await env.DB.batch([
			env.DB.prepare("insert into admin_memberships (user_id, created_at) values (?, ?)").bind(a.id, now),
			env.DB.prepare("insert into support_reports (report_id, category, status, attempts, created_at, updated_at) values (?, 'problem', 'manual_review', 0, ?, ?)").bind(reportId, now, now),
			env.DB.prepare("insert into support_report_payloads (report_id, user_id, client_request_id, fingerprint, message, diagnostics, metadata, received_at, expires_at) values (?, ?, ?, 'fingerprint', 'private', '{}', '{}', ?, ?)").bind(reportId, a.id, crypto.randomUUID(), now, now - 1),
		]);
		const publish = vi.fn();
		await expect(publishAdminSupport(env.DB, new Headers({ cookie: a.cookieHeader }), reportId, {}, { ...env, appSecret: env.APP_SECRET, publish })).rejects.toMatchObject<Partial<AdminSupportError>>({ status: 409, message: "private_payload_expired" });
		expect(publish).not.toHaveBeenCalled();
		const snapshots = await env.DB.prepare("select count(*) as count from support_manual_publications where report_id = ?").bind(reportId).first<{ count: number }>();
		expect(snapshots?.count).toBe(0);
	});
});

describe("admin invitation flow", () => {
	it("prepares, carries the API-scoped cookie through OAuth callback and consumes membership once", async () => {
		const { a, b } = await createAuthedPair();
		const token = `route-${crypto.randomUUID()}`;
		const inviteId = crypto.randomUUID();
		await env.DB
			.prepare(
				"insert into admin_invites (invite_id, token_hmac, expires_at, created_at) values (?, ?, ?, ?)",
			)
			.bind(
				inviteId,
				await adminHmac(env.APP_SECRET, "admin-invite:v1", token),
				Date.now() + 86_400_000,
				Date.now(),
			)
			.run();
		const prepared = await prepareAdminInvite(env.DB, { token, email: a.email }, env.APP_SECRET);
		expect(prepared.headers["set-cookie"]).toContain("Path=/api/admin/invite");
		expect(
			await env.DB
				.prepare("select email_normalized from admin_invites where invite_id = ?")
				.bind(inviteId)
				.first<{ email_normalized: string | null }>(),
		).toEqual({ email_normalized: a.email.toLowerCase() });
		await expect(
			prepareAdminInvite(env.DB, { token, email: b.email }, env.APP_SECRET),
		).rejects.toMatchObject({ status: 400, message: "invalid_invite" });
		const cookie = prepared.headers["set-cookie"].split(";")[0];
		const request = new Request("https://example.test/api/admin/invite/conclude", { method: "POST", headers: { cookie: `${a.cookieHeader}; ${cookie}`, origin: "https://example.test" } });
		await expect(concludeAdminInvite(env.DB, request, env.APP_SECRET)).resolves.toMatchObject({ headers: { "cache-control": "no-store" } });
		const membership = await env.DB.prepare("select user_id from admin_memberships where user_id = ?").bind(a.id).first();
		expect(membership).not.toBeNull();
		await expect(concludeAdminInvite(env.DB, request, env.APP_SECRET)).rejects.toMatchObject({ status: 400 });
	});
});

describe("admin authorization guards", () => {
	it("returns 401 for anonymous, 403 for common users and authorizes a current member", async () => {
		const { a } = await createAuthedPair();
		await expect(requireAdmin(env.DB, new Headers())).rejects.toMatchObject<Partial<AdminAuthError>>({ status: 401 });
		await expect(requireAdmin(env.DB, new Headers({ cookie: a.cookieHeader }))).rejects.toMatchObject<Partial<AdminAuthError>>({ status: 403 });
		await env.DB.prepare("insert into admin_memberships (user_id, created_at) values (?, ?)").bind(a.id, Date.now()).run();
		await expect(requireAdmin(env.DB, new Headers({ cookie: a.cookieHeader }))).resolves.toMatchObject({ id: a.id });
	});

	it("rejects missing and foreign Origin for administrative writes", () => {
		expect(sameOrigin(new Request("https://app.test/api/admin/support/x/publish", { method: "POST" }))).toBe(false);
		expect(sameOrigin(new Request("https://app.test/api/admin/support/x/publish", { method: "POST", headers: { origin: "https://evil.test" } }))).toBe(false);
		expect(sameOrigin(new Request("https://app.test/api/admin/support/x/publish", { method: "POST", headers: { origin: "https://app.test" } }))).toBe(true);
	});
});

describe("admin HTTP route handlers", () => {
	it("serves the real membership, list and detail handlers only to administrators", async () => {
		const { a, b } = await createAuthedPair();
		const reportId = crypto.randomUUID();
		const now = Date.now();
		const reviewEventId = `review:${reportId}`;
		await env.DB.batch([
			env.DB
				.prepare("insert into admin_memberships (user_id, created_at) values (?, ?)")
				.bind(a.id, now),
			env.DB
				.prepare("insert into support_reports (report_id, category, status, attempts, issue_number, issue_url, created_at, updated_at) values (?, 'problem', 'published', 3, 31, 'https://github.com/gugacarbo/din-din/issues/31', ?, ?)")
				.bind(reportId, now, now),
			env.DB
				.prepare("insert into support_report_payloads (report_id, user_id, client_request_id, fingerprint, message, diagnostics, metadata, received_at, expires_at) values (?, ?, ?, 'fingerprint', 'Mensagem privada de teste', '{}', '{}', ?, ?)")
				.bind(reportId, a.id, crypto.randomUUID(), now, now + 60_000),
			env.DB
				.prepare("insert into support_review_tasks (event_id, report_id, kind, reason, status, created_at, updated_at) values (?, ?, 'manual_review', 'needs_human', 'pending', ?, ?)")
				.bind(reviewEventId, reportId, now, now),
		]);

		expect(
			(await handlers.membership({ request: adminRequest("/api/admin/membership") })).status,
		).toBe(403);
		expect(
			(await handlers.membership({ request: adminRequest("/api/admin/membership", b.cookieHeader) })).status,
		).toBe(403);
		const membership = await handlers.membership({
			request: adminRequest("/api/admin/membership", a.cookieHeader),
		});
		expect(membership.status).toBe(200);
		expect(await membership.json()).toEqual({ isAdmin: true });

		expect(
			(await handlers.list({ request: adminRequest("/api/admin/support/") })).status,
		).toBe(401);
		expect(
			(await handlers.list({ request: adminRequest("/api/admin/support/", b.cookieHeader) })).status,
		).toBe(403);
		const list = await handlers.list({
			request: adminRequest("/api/admin/support/", a.cookieHeader),
		});
		expect(list.status).toBe(200);
		expect((await list.json()).items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					report_id: reportId,
					attempts: 3,
					issue_number: 31,
					issue_url: "https://github.com/gugacarbo/din-din/issues/31",
					review_tasks: [
						expect.objectContaining({
							event_id: reviewEventId,
							kind: "manual_review",
							status: "pending",
						}),
					],
				}),
			]),
		);

		expect(
			(await handlers.detail({
				request: adminRequest(`/api/admin/support/${reportId}`),
				params: { reportId },
			})).status,
		).toBe(401);
		expect(
			(await handlers.detail({
				request: adminRequest(`/api/admin/support/${reportId}`, b.cookieHeader),
				params: { reportId },
			})).status,
		).toBe(403);
		const detail = await handlers.detail({
			request: adminRequest(`/api/admin/support/${reportId}`, a.cookieHeader),
			params: { reportId },
		});
		expect(detail.status).toBe(200);
		expect(await detail.json()).toMatchObject({
			report_id: reportId,
			attempts: 3,
			issue_number: 31,
			issue_url: "https://github.com/gugacarbo/din-din/issues/31",
			message: "Mensagem privada de teste",
			review_tasks: [
				expect.objectContaining({ event_id: reviewEventId }),
			],
		});
	});

	it("rejects missing Origin before each real administrative POST handler", async () => {
		const { a } = await createAuthedPair();
		for (const response of await Promise.all([
			handlers.prepare({
				request: adminRequest("/api/admin/invite/prepare", undefined, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({}),
				}),
			}),
			handlers.conclude({
				request: adminRequest("/api/admin/invite/conclude", a.cookieHeader, {
					method: "POST",
				}),
			}),
			handlers.publish({
				request: adminRequest(`/api/admin/support/${crypto.randomUUID()}/publish`, a.cookieHeader, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({}),
				}),
				params: { reportId: crypto.randomUUID() },
			}),
		])) {
			expect(response.status).toBe(403);
		}
	});

	it("refuses expired private payload through the publish route with zero publication effects", async () => {
		const { a } = await createAuthedPair();
		const reportId = crypto.randomUUID();
		const now = Date.now();
		await env.DB.batch([
			env.DB
				.prepare("insert into admin_memberships (user_id, created_at) values (?, ?)")
				.bind(a.id, now),
			env.DB
				.prepare("insert into support_reports (report_id, category, status, attempts, created_at, updated_at) values (?, 'problem', 'manual_review', 0, ?, ?)")
				.bind(reportId, now, now),
			env.DB
				.prepare("insert into support_report_payloads (report_id, user_id, client_request_id, fingerprint, message, diagnostics, metadata, received_at, expires_at) values (?, ?, ?, 'fingerprint', 'private', '{}', '{}', ?, ?)")
				.bind(reportId, a.id, crypto.randomUUID(), now, now - 1),
		]);
		const response = await handlers.publish({
			request: adminRequest(`/api/admin/support/${reportId}/publish`, a.cookieHeader, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://test.invalid",
				},
				body: JSON.stringify({}),
			}),
			params: { reportId },
		});
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ code: "private_payload_expired" });
		const snapshots = await env.DB
			.prepare("select count(*) as count from support_manual_publications where report_id = ?")
			.bind(reportId)
			.first<{ count: number }>();
		expect(snapshots?.count).toBe(0);
		expect(
			await env.DB
				.prepare("select status, issue_number, issue_url from support_reports where report_id = ?")
				.bind(reportId)
				.first(),
		).toEqual({ status: "manual_review", issue_number: null, issue_url: null });
	});

	it("prepares and concludes an invite through route handlers with the OAuth session cookie", async () => {
		const { a } = await createAuthedPair();
		const token = "t".repeat(32);
		const inviteId = crypto.randomUUID();
		await env.DB
			.prepare("insert into admin_invites (invite_id, token_hmac, expires_at, created_at) values (?, ?, ?, ?)")
			.bind(
				inviteId,
				await adminHmac(env.APP_SECRET, "admin-invite:v1", token),
				Date.now() + 86_400_000,
				Date.now(),
			)
			.run();
		const prepare = await handlers.prepare({
			request: adminRequest("/api/admin/invite/prepare", undefined, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://test.invalid",
				},
				body: JSON.stringify({ token, email: a.email }),
			}),
		});
		expect(prepare.status).toBe(200);
		const continuationCookie = prepare.headers.get("set-cookie")?.split(";")[0];
		expect(continuationCookie).toContain("din-din-admin-invite=");
		const conclude = await handlers.conclude({
			request: adminRequest("/api/admin/invite/conclude", `${a.cookieHeader}; ${continuationCookie}`, {
				method: "POST",
				headers: { origin: "https://test.invalid" },
			}),
		});
		expect(conclude.status).toBe(200);
		expect(conclude.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(
			await env.DB
				.prepare("select user_id from admin_memberships where user_id = ?")
				.bind(a.id)
				.first(),
		).not.toBeNull();
	});
});
