import { z } from "zod";
import { adminHmac } from "#/lib/admin-invite.ts";
import { requireAdmin } from "#/server/admin-auth.ts";
import { publishSupportIssue } from "#/server/github-support-publisher.ts";
import {
	type PublicIssue,
	publicIssueFromModel,
} from "#/server/support-publication-policy.ts";

const publicationSchema = z.object({
	title: z.string(),
	summary: z.string(),
	technicalCategory: z.enum(["bug", "question", "suggestion"]),
	observedBehavior: z.string(),
	probableSteps: z.array(z.string()),
	technicalSignals: z.array(z.string()),
	labels: z.array(z.enum(["bug", "enhancement", "question"])),
});

export class AdminSupportError extends Error {
	constructor(
		readonly status: 400 | 403 | 404 | 409,
		message: string,
	) {
		super(message);
	}
}

type SupportDeps = Pick<
	Env,
	"GITHUB_APP_ID" | "GITHUB_APP_INSTALLATION_ID" | "GITHUB_APP_PRIVATE_KEY"
> & { appSecret: string; publish?: typeof publishSupportIssue };

async function activePayload(d1: D1Database, reportId: string) {
	return d1
		.prepare(
			"select p.message, p.diagnostics from support_reports r join support_report_payloads p on p.report_id = r.report_id where r.report_id = ? and r.status = 'manual_review' and p.expires_at > ?",
		)
		.bind(reportId, Date.now())
		.first<{ message: string; diagnostics: string }>();
}

export async function listAdminSupport(
	d1: D1Database,
	headers: Headers,
	cursor?: string,
	limit = 25,
) {
	await requireAdmin(d1, headers);
	const safeLimit = Math.min(Math.max(limit, 1), 50);
	const rows = await d1
		.prepare(
			"select report_id, category, status, safe_reason, issue_number, issue_url, created_at from support_reports where (? is null or created_at < ?) order by created_at desc limit ?",
		)
		.bind(cursor ?? null, cursor ? Number(cursor) : null, safeLimit + 1)
		.all<{
			report_id: string;
			category: string;
			status: string;
			safe_reason: string | null;
			issue_number: number | null;
			issue_url: string | null;
			created_at: number;
		}>();
	const page = rows.results.slice(0, safeLimit);
	return {
		items: page,
		nextCursor:
			rows.results.length > safeLimit ? String(page.at(-1)?.created_at) : null,
	};
}

export async function adminSupportDetail(
	d1: D1Database,
	headers: Headers,
	reportId: string,
) {
	await requireAdmin(d1, headers);
	const report = await d1
		.prepare(
			"select report_id, category, status, safe_reason, issue_number, issue_url, created_at from support_reports where report_id = ?",
		)
		.bind(reportId)
		.first<{
			report_id: string;
			category: string;
			status: string;
			safe_reason: string | null;
			issue_number: number | null;
			issue_url: string | null;
			created_at: number;
		}>();
	if (!report) throw new AdminSupportError(404, "report_not_found");
	const payload = await activePayload(d1, reportId);
	return {
		...report,
		canManualPublish: report.status === "manual_review" && Boolean(payload),
		unavailableReason:
			report.status === "manual_review" && !payload
				? "private_payload_expired"
				: null,
	};
}

export async function publishAdminSupport(
	d1: D1Database,
	headers: Headers,
	reportId: string,
	input: unknown,
	deps: SupportDeps,
) {
	const actor = await requireAdmin(d1, headers);
	const payload = await activePayload(d1, reportId);
	// This guard must precede parsing, policy, reservation and GitHub.
	if (!payload) throw new AdminSupportError(409, "private_payload_expired");
	const parsed = publicationSchema.safeParse(input);
	if (!parsed.success)
		throw new AdminSupportError(400, "invalid_public_content");
	const checked = publicIssueFromModel(parsed.data, [
		payload.message,
		payload.diagnostics,
	]);
	if (!checked.ok) throw new AdminSupportError(400, checked.reason);
	const now = Date.now();
	const contentHash = await adminHmac(
		deps.appSecret,
		"admin-manual-publication:v1",
		JSON.stringify(checked.value),
	);
	const reserve = await d1
		.prepare(
			"insert or ignore into support_manual_publications (report_id, actor_user_id, content_hash, public_issue, created_at) select ?, ?, ?, ?, ? where exists(select 1 from support_reports where report_id = ? and status = 'manual_review')",
		)
		.bind(
			reportId,
			actor.id,
			contentHash,
			JSON.stringify(checked.value),
			now,
			reportId,
		)
		.run();
	if (reserve.meta.changes !== 1)
		throw new AdminSupportError(409, "manual_publication_already_reserved");
	try {
		const issue = await (deps.publish ?? publishSupportIssue)(
			deps,
			reportId,
			checked.value,
		);
		await d1
			.prepare(
				"update support_reports set status = 'published', issue_number = ?, issue_url = ?, safe_reason = null, updated_at = ? where report_id = ? and status = 'manual_review'",
			)
			.bind(issue.number, issue.url, Date.now(), reportId)
			.run();
		await d1
			.prepare(
				"update support_manual_publications set published_at = ? where report_id = ?",
			)
			.bind(Date.now(), reportId)
			.run();
		return issue;
	} catch {
		throw new AdminSupportError(409, "github_ambiguous");
	}
}

export type { PublicIssue };
