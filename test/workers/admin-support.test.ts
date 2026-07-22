import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { AdminSupportError, publishAdminSupport } from "#/server/admin-support-service.ts";
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
