import { publishSupportIssue } from "#/server/github-support-publisher.ts";
import { publicIssueFromModel } from "#/server/support-publication-policy.ts";

type TriageMessage = { kind: "triage"; reportId: string };
type ReviewMessage = {
	kind: "manual_review";
	reportId: string;
	eventId: string;
};

async function manualReview(env: Env, reportId: string, reason: string) {
	const now = Date.now();
	const eventId = `manual:${reportId}:${reason}`;
	await env.DB.batch([
		env.DB.prepare(
			"update support_reports set status = 'manual_review', safe_reason = ?, updated_at = ? where report_id = ?",
		).bind(reason, now, reportId),
		env.DB.prepare(
			"insert or ignore into support_review_tasks (event_id, report_id, kind, reason, status, created_at, updated_at) values (?, ?, 'manual_review', ?, 'pending', ?, ?)",
		).bind(eventId, reportId, reason, now, now),
	]);
	try {
		await env.SUPPORT_REPORTS_DLQ.send({
			kind: "manual_review",
			reportId,
			eventId,
		} satisfies ReviewMessage);
		await env.DB.prepare(
			"update support_review_tasks set status = 'sent', updated_at = ? where event_id = ?",
		)
			.bind(Date.now(), eventId)
			.run();
	} catch {
		console.error(
			JSON.stringify({ event: "support_dlq_outbox_pending", reportId, reason }),
		);
	}
}

async function triage(env: Env, reportId: string) {
	const row = await env.DB.prepare(
		"select r.status, p.message, p.diagnostics from support_reports r join support_report_payloads p on p.report_id = r.report_id where r.report_id = ?",
	)
		.bind(reportId)
		.first<{ status: string; message: string; diagnostics: string }>();
	if (!row || row.status === "published" || row.status === "manual_review")
		return "ack" as const;
	await env.DB.prepare(
		"update support_reports set status = 'processing', attempts = attempts + 1, updated_at = ? where report_id = ?",
	)
		.bind(Date.now(), reportId)
		.run();
	let output: unknown;
	try {
		output = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
			prompt: `Produce only JSON with title, summary, technicalCategory (bug|question|suggestion), observedBehavior, probableSteps (array), technicalSignals (array), labels (bug|enhancement|question). Do not copy user text, include personal data, URLs, markdown, mentions, or secrets.\nUser report: ${row.message}\nSanitized diagnostics: ${row.diagnostics}`,
			response_format: { type: "json_object" },
			max_tokens: 800,
		});
	} catch {
		return "retry" as const;
	}
	let model: unknown;
	try {
		const response =
			typeof output === "string"
				? output
				: typeof output === "object" &&
						output !== null &&
						"response" in output &&
						typeof output.response === "string"
					? output.response
					: "";
		model = JSON.parse(response || "");
	} catch {
		await manualReview(env, reportId, "invalid_ai_output");
		return "ack" as const;
	}
	const publication = publicIssueFromModel(model, [
		row.message,
		row.diagnostics,
	]);
	if (!publication.ok) {
		await manualReview(env, reportId, publication.reason);
		return "ack" as const;
	}
	try {
		const issue = await publishSupportIssue(env, reportId, publication.value);
		await env.DB.prepare(
			"update support_reports set status = 'published', issue_number = ?, issue_url = ?, safe_reason = null, updated_at = ? where report_id = ?",
		)
			.bind(issue.number, issue.url, Date.now(), reportId)
			.run();
		return "ack" as const;
	} catch {
		// A GitHub POST result can be ambiguous. Never retry it blindly.
		await manualReview(env, reportId, "github_ambiguous");
		return "ack" as const;
	}
}

export async function consumeSupportQueue(
	batch: MessageBatch<unknown>,
	env: Env,
) {
	if (batch.queue.includes("-dlq")) {
		for (const message of batch.messages) {
			const body = message.body as Partial<ReviewMessage | TriageMessage>;
			if (body.kind === "manual_review" && body.reportId && body.eventId)
				await env.DB.prepare(
					"update support_review_tasks set status = 'observed', updated_at = ? where event_id = ?",
				)
					.bind(Date.now(), body.eventId)
					.run();
			else if (body.kind === "triage" && body.reportId)
				await manualReview(env, body.reportId, "transient_retries_exhausted");
			message.ack();
		}
		return;
	}
	for (const message of batch.messages) {
		const body = message.body as Partial<TriageMessage>;
		if (body.kind !== "triage" || !body.reportId) {
			message.ack();
			continue;
		}
		const result = await triage(env, body.reportId);
		if (result === "retry" && message.attempts < 3)
			message.retry({ delaySeconds: Math.min(60, 2 ** message.attempts) });
		else if (result === "retry") {
			await manualReview(env, body.reportId, "transient_retries_exhausted");
			message.ack();
		} else message.ack();
	}
}

export async function scheduledSupportMaintenance(env: Env) {
	const pending = await env.DB.prepare(
		"select event_id, report_id from support_review_tasks where status = 'pending' limit 50",
	).all<{ event_id: string; report_id: string }>();
	for (const task of pending.results) {
		await env.SUPPORT_REPORTS_DLQ.send({
			kind: "manual_review",
			reportId: task.report_id,
			eventId: task.event_id,
		} satisfies ReviewMessage);
		await env.DB.prepare(
			"update support_review_tasks set status = 'sent', updated_at = ? where event_id = ?",
		)
			.bind(Date.now(), task.event_id)
			.run();
	}
	const expired = await env.DB.prepare(
		"select report_id, screenshot_key from support_report_payloads where expires_at <= ? limit 100",
	)
		.bind(Date.now())
		.all<{ report_id: string; screenshot_key: string | null }>();
	for (const payload of expired.results) {
		if (payload.screenshot_key)
			await env.SUPPORT_SCREENSHOTS.delete(payload.screenshot_key);
		await env.DB.prepare(
			"delete from support_report_payloads where report_id = ?",
		)
			.bind(payload.report_id)
			.run();
	}
}
