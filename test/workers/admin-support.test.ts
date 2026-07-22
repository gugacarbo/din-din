import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { AdminSupportError, publishAdminSupport } from "#/server/admin-support-service.ts";
import { adminHmac } from "#/lib/admin-invite.ts";
import { concludeAdminInvite, prepareAdminInvite } from "#/server/admin-invite-service.ts";
import { createAuthedPair } from "./fixtures.ts";

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
		const { a } = await createAuthedPair();
		const token = "t".repeat(32);
		const inviteId = crypto.randomUUID();
		await env.DB.prepare("insert into admin_invites (invite_id, token_hmac, email_normalized, expires_at, created_at) values (?, ?, ?, ?, ?)").bind(inviteId, await adminHmac(env.APP_SECRET, "admin-invite:v1", token), a.email.toLowerCase(), Date.now() + 86_400_000, Date.now()).run();
		const prepared = await prepareAdminInvite(env.DB, { token, email: a.email }, env.APP_SECRET);
		expect(prepared.headers["set-cookie"]).toContain("Path=/api/admin/invite");
		const cookie = prepared.headers["set-cookie"].split(";")[0];
		const request = new Request("https://example.test/api/admin/invite/conclude", { method: "POST", headers: { cookie: `${a.cookieHeader}; ${cookie}`, origin: "https://example.test" } });
		await expect(concludeAdminInvite(env.DB, request, env.APP_SECRET)).resolves.toMatchObject({ headers: { "cache-control": "no-store" } });
		const membership = await env.DB.prepare("select user_id from admin_memberships where user_id = ?").bind(a.id).first();
		expect(membership).not.toBeNull();
		await expect(concludeAdminInvite(env.DB, request, env.APP_SECRET)).rejects.toMatchObject({ status: 400 });
	});
});
