import {
	runAiWithLogging,
	safeAiErrorDetails,
	safeAiOutputDetails,
} from "#/server/ai-logging.ts";
import {
	type GitHubRequestFailure,
	githubRequestFailuresFromError,
	publishSupportIssue,
} from "#/server/github-support-publisher.ts";
import {
	parseSupportIssueWriterOutput,
	serialiseSupportIssueWriterResponse,
	supportIssueWriterModel,
	supportIssueWriterOptions,
} from "#/server/support-issue-writer.ts";
import { publicIssueFromModel } from "#/server/support-publication-policy.ts";

type TriageMessage = { kind: "triage"; reportId: string };
type ReviewMessage = {
	kind: "manual_review";
	reportId: string;
	eventId: string;
};
const leaseMs = 5 * 60 * 1_000;

async function recordPrivateAiResponse(
	env: Env,
	reportId: string,
	output: unknown,
	parseError: string | null,
) {
	try {
		await env.DB.prepare(
			"update support_report_payloads set ai_response = ?, ai_response_error = ? where report_id = ? and expires_at > ?",
		)
			.bind(
				serialiseSupportIssueWriterResponse(output),
				parseError,
				reportId,
				Date.now(),
			)
			.run();
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "support_ai_private_response_log_failed",
				reportId,
				error: safeAiErrorDetails(error),
			}),
		);
	}
}

async function recordPrivateRequestFailures(
	env: Env,
	reportId: string,
	failures: GitHubRequestFailure[],
) {
	if (failures.length === 0) return;
	try {
		await env.DB.prepare(
			"update support_report_payloads set request_failures = ? where report_id = ? and expires_at > ?",
		)
			.bind(JSON.stringify(failures.slice(0, 10)), reportId, Date.now())
			.run();
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "support_request_failure_log_failed",
				reportId,
				error: safeAiErrorDetails(error),
			}),
		);
	}
}

async function manualReview(
	env: Env,
	reportId: string,
	reason: string,
	claim?: { leaseToken?: string; publicationToken?: string },
) {
	const now = Date.now();
	const eventId = `manual:${reportId}:${reason}`;
	await env.DB.batch([
		env.DB.prepare(
			"update support_reports set status = 'manual_review', safe_reason = ?, lease_token = null, lease_expires_at = null, publication_token = null, publication_reserved_at = null, updated_at = ? where report_id = ? and (? is null or lease_token = ?) and (? is null or publication_token = ?)",
		).bind(
			reason,
			now,
			reportId,
			claim?.leaseToken ?? null,
			claim?.leaseToken ?? null,
			claim?.publicationToken ?? null,
			claim?.publicationToken ?? null,
		),
		env.DB.prepare(
			"insert or ignore into support_review_tasks (event_id, report_id, kind, reason, status, created_at, updated_at) select ?, ?, 'manual_review', ?, 'pending', ?, ? where exists(select 1 from support_reports where report_id = ? and status = 'manual_review' and safe_reason = ?)",
		).bind(eventId, reportId, reason, now, now, reportId, reason),
	]);
	const task = await env.DB.prepare(
		"select status from support_review_tasks where event_id = ?",
	)
		.bind(eventId)
		.first<{ status: string }>();
	if (task?.status !== "pending") return;
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

async function claim(env: Env, reportId: string) {
	const now = Date.now();
	const token = crypto.randomUUID();
	const result = await env.DB.prepare(
		"update support_reports set status = 'processing', attempts = attempts + 1, lease_token = ?, lease_expires_at = ?, updated_at = ? where report_id = ? and publication_token is null and (status in ('pending', 'queued') or (status = 'processing' and (lease_expires_at is null or lease_expires_at <= ?)))",
	)
		.bind(token, now + leaseMs, now, reportId, now)
		.run();
	if (result.meta.changes !== 1) {
		const reserved = await env.DB.prepare(
			"select publication_token from support_reports where report_id = ? and status = 'processing' and publication_token is not null",
		)
			.bind(reportId)
			.first<{ publication_token: string }>();
		return reserved ? { publicationToken: reserved.publication_token } : null;
	}
	const row = await env.DB.prepare(
		"select p.message, p.diagnostics, p.user_id from support_reports r join support_report_payloads p on p.report_id = r.report_id where r.report_id = ? and r.lease_token = ?",
	)
		.bind(reportId, token)
		.first<{
			message: string;
			diagnostics: string;
			user_id: string;
		}>();
	return row ? { ...row, token } : null;
}

async function releaseForRetry(env: Env, reportId: string, token: string) {
	await env.DB.prepare(
		"update support_reports set status = 'queued', lease_token = null, lease_expires_at = null, updated_at = ? where report_id = ? and lease_token = ? and publication_token is null",
	)
		.bind(Date.now(), reportId, token)
		.run();
}

/**
 * This reservation is intentionally independent from the short execution
 * lease. Once held, a redelivery cannot issue a competing GitHub POST even if
 * the original worker outlives its lease. We never reclaim it automatically:
 * an interrupted POST is ambiguous and must go through manual review.
 */
async function reservePublication(
	env: Env,
	reportId: string,
	leaseToken: string,
) {
	const now = Date.now();
	const publicationToken = crypto.randomUUID();
	const result = await env.DB.prepare(
		"update support_reports set publication_token = ?, publication_reserved_at = ?, lease_expires_at = ?, updated_at = ? where report_id = ? and status = 'processing' and lease_token = ? and lease_expires_at > ? and publication_token is null",
	)
		.bind(publicationToken, now, now + leaseMs, now, reportId, leaseToken, now)
		.run();
	return result.meta.changes === 1 ? publicationToken : null;
}

async function recordExhaustedTriage(env: Env, reportId: string) {
	const now = Date.now();
	const eventId = `failed:${reportId}:transient_retries_exhausted`;
	await env.DB.batch([
		env.DB.prepare(
			"update support_reports set status = 'failed', safe_reason = 'transient_retries_exhausted', lease_token = null, lease_expires_at = null, publication_token = null, publication_reserved_at = null, updated_at = ? where report_id = ? and (status in ('pending', 'queued') or (status = 'processing' and publication_token is null and (lease_expires_at is null or lease_expires_at <= ?)))",
		).bind(now, reportId, now),
		env.DB.prepare(
			"insert or ignore into support_review_tasks (event_id, report_id, kind, reason, status, created_at, updated_at) select ?, ?, 'transient_failure', 'transient_retries_exhausted', 'observed', ?, ? where exists(select 1 from support_reports where report_id = ? and status = 'failed' and safe_reason = 'transient_retries_exhausted')",
		).bind(eventId, reportId, now, now, reportId),
	]);
}

async function triage(env: Env, reportId: string, deliveryAttempt: number) {
	const row = await claim(env, reportId);
	if (!row) return "ack" as const;
	if ("publicationToken" in row) {
		// A previous worker may have died after the durable reservation but before
		// the GitHub response. Treat every redelivery as ambiguous: no blind POST.
		await manualReview(env, reportId, "publication_reservation_ambiguous", {
			publicationToken: row.publicationToken,
		});
		return "ack" as const;
	}
	const invocationId = crypto.randomUUID();
	let output: unknown;
	try {
		output = await runAiWithLogging(
			env,
			supportIssueWriterModel,
			supportIssueWriterOptions(row.message, row.diagnostics),
			{
				invocationId,
				agentKey: "issue-writer",
				userId: row.user_id,
				reportId,
				metadata: { deliveryAttempt },
			},
		);
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "support_ai_retry_scheduled",
				invocationId,
				reportId,
				error: safeAiErrorDetails(error),
			}),
		);
		await releaseForRetry(env, reportId, row.token);
		return "retry" as const;
	}
	let model: unknown;
	try {
		model = parseSupportIssueWriterOutput(output);
	} catch (error) {
		const errorDetails = safeAiErrorDetails(error);
		await recordPrivateAiResponse(env, reportId, output, errorDetails.message);
		console.error(
			JSON.stringify({
				event: "support_ai_output_invalid",
				invocationId,
				reportId,
				error: errorDetails,
				...safeAiOutputDetails(output),
			}),
		);
		await manualReview(env, reportId, "invalid_ai_output", {
			leaseToken: row.token,
		});
		return "ack" as const;
	}
	await recordPrivateAiResponse(env, reportId, output, null);
	const publication = publicIssueFromModel(model, [
		row.message,
		row.diagnostics,
	]);
	if (!publication.ok) {
		console.warn(
			JSON.stringify({
				event: "support_ai_output_rejected",
				invocationId,
				reportId,
				reason: publication.reason,
			}),
		);
		await manualReview(env, reportId, publication.reason, {
			leaseToken: row.token,
		});
		return "ack" as const;
	}
	const publicationToken = await reservePublication(env, reportId, row.token);
	if (!publicationToken) return "ack" as const;
	console.info(
		JSON.stringify({
			event: "support_issue_publication_started",
			invocationId,
			reportId,
		}),
	);
	try {
		const issue = await publishSupportIssue(env, reportId, publication.value);
		if ("requestFailures" in issue)
			await recordPrivateRequestFailures(env, reportId, issue.requestFailures);
		await env.DB.prepare(
			"update support_reports set status = 'published', issue_number = ?, issue_url = ?, safe_reason = null, lease_token = null, lease_expires_at = null, publication_token = null, publication_reserved_at = null, updated_at = ? where report_id = ? and publication_token = ?",
		)
			.bind(issue.number, issue.url, Date.now(), reportId, publicationToken)
			.run();
		console.info(
			JSON.stringify({
				event: "support_issue_published",
				invocationId,
				reportId,
				issueNumber: issue.number,
			}),
		);
		return "ack" as const;
	} catch (error) {
		await recordPrivateRequestFailures(
			env,
			reportId,
			githubRequestFailuresFromError(error),
		);
		console.error(
			JSON.stringify({
				event: "support_issue_publication_failed",
				invocationId,
				reportId,
				error: safeAiErrorDetails(error),
			}),
		);
		// A GitHub POST result can be ambiguous. Never retry it blindly.
		await manualReview(env, reportId, "github_ambiguous", {
			publicationToken,
		});
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
				await recordExhaustedTriage(env, body.reportId);
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
		const result = await triage(env, body.reportId, message.attempts);
		if (result === "retry")
			// The Queue runtime moves this triage envelope to its configured DLQ
			// after max_retries; acknowledging here would permanently lose it.
			message.retry({ delaySeconds: Math.min(60, 2 ** message.attempts) });
		else message.ack();
	}
}

export async function scheduledSupportMaintenance(env: Env) {
	const pending = await env.DB.prepare(
		"select event_id, report_id from support_review_tasks where status = 'pending' and kind = 'manual_review' limit 50",
	).all<{ event_id: string; report_id: string }>();
	for (const task of pending.results) {
		try {
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
		} catch {
			console.error(
				JSON.stringify({
					event: "support_dlq_outbox_pending",
					reportId: task.report_id,
					eventId: task.event_id,
				}),
			);
		}
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
