import { createCoreAuth } from "#/lib/auth-core.ts";
import {
	redactText,
	type SupportInput,
	serialiseDiagnostics,
	supportInputSchema,
} from "#/lib/support.ts";

const maxPayload = 3 * 1024 * 1024;
const maxScreenshot = 2 * 1024 * 1024;
const expiryMs = 30 * 24 * 60 * 60 * 1000;
type QueueMessage = { kind: "triage"; reportId: string };

export type SupportDependencies = {
	d1: D1Database;
	screenshots: R2Bucket;
	queue: Queue<QueueMessage>;
};

export class SupportError extends Error {
	constructor(
		readonly status: 400 | 401 | 409 | 413 | 429 | 500,
		message: string,
	) {
		super(message);
	}
}

function hex(buffer: ArrayBuffer) {
	return Array.from(new Uint8Array(buffer), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}
async function fingerprint(input: SupportInput, screenshot?: File) {
	const metadata = new TextEncoder().encode(
		JSON.stringify({
			input,
			screenshot: screenshot
				? { type: screenshot.type, size: screenshot.size }
				: null,
		}),
	);
	const bytes = screenshot
		? new Uint8Array(await screenshot.arrayBuffer())
		: new Uint8Array();
	const body = new Uint8Array(metadata.length + bytes.length);
	body.set(metadata);
	body.set(bytes, metadata.length);
	return hex(await crypto.subtle.digest("SHA-256", body));
}
function jsonError(error: unknown) {
	if (error instanceof SupportError)
		return Response.json({ message: error.message }, { status: error.status });
	console.error(
		JSON.stringify({
			event: "support_intake_failed",
			reason: "internal_error",
		}),
	);
	return Response.json(
		{ message: "Não foi possível enviar sua mensagem. Tente novamente." },
		{ status: 500 },
	);
}

async function authenticatedUserId(d1: D1Database, headers: Headers) {
	const session = await createCoreAuth(d1).api.getSession({ headers });
	if (!session?.user?.id)
		throw new SupportError(401, "Faça login para enviar uma mensagem.");
	return session.user.id;
}

async function existing(d1: D1Database, userId: string, requestId: string) {
	return d1
		.prepare(
			"select p.report_id, p.fingerprint, p.screenshot_key, r.status from support_report_payloads p join support_reports r on r.report_id = p.report_id where p.user_id = ? and p.client_request_id = ?",
		)
		.bind(userId, requestId)
		.first<{
			report_id: string;
			fingerprint: string;
			screenshot_key: string | null;
			status: string;
		}>();
}

async function ensureScreenshot(
	bucket: R2Bucket,
	key: string | null,
	screenshot: File | null,
) {
	if (!key) return;
	if (await bucket.head(key)) return;
	if (!screenshot)
		throw new SupportError(
			400,
			"Reenvie o print para concluir esta tentativa de suporte.",
		);
	await bucket.put(key, screenshot.stream(), {
		httpMetadata: { contentType: screenshot.type },
	});
}

export async function acceptSupportReport(
	request: Request,
	deps: SupportDependencies,
) {
	try {
		const length = Number(request.headers.get("content-length") || "0");
		if (length > maxPayload)
			throw new SupportError(413, "O envio excede o limite permitido.");
		const form = await request.formData();
		const raw = form.get("payload");
		if (typeof raw !== "string")
			throw new SupportError(400, "Relato inválido.");
		let decoded: unknown;
		try {
			decoded = JSON.parse(raw);
		} catch {
			throw new SupportError(400, "Relato inválido.");
		}
		const parsed = supportInputSchema.safeParse(decoded);
		if (!parsed.success)
			throw new SupportError(400, "Revise os dados do relato.");
		const screenshot = form.get("screenshot");
		if (
			screenshot !== null &&
			(!(screenshot instanceof File) ||
				!["image/png", "image/webp"].includes(screenshot.type) ||
				screenshot.size > maxScreenshot)
		)
			throw new SupportError(413, "O print deve ser PNG ou WebP de até 2 MiB.");
		const userId = await authenticatedUserId(deps.d1, request.headers);
		const input = parsed.data;
		const inputFingerprint = await fingerprint(
			input,
			screenshot instanceof File ? screenshot : undefined,
		);
		const previous = await existing(deps.d1, userId, input.clientRequestId);
		if (previous) {
			if (previous.fingerprint !== inputFingerprint)
				throw new SupportError(
					409,
					"Esta tentativa já possui dados diferentes.",
				);
			if (
				previous.status === "queued" ||
				previous.status === "processing" ||
				previous.status === "published" ||
				previous.status === "manual_review"
			)
				return Response.json({ received: true, reportId: previous.report_id });
			await ensureScreenshot(
				deps.screenshots,
				previous.screenshot_key,
				screenshot instanceof File ? screenshot : null,
			);
			await deps.queue.send({ kind: "triage", reportId: previous.report_id });
			await deps.d1
				.prepare(
					"update support_reports set status = 'queued', updated_at = ? where report_id = ?",
				)
				.bind(Date.now(), previous.report_id)
				.run();
			return Response.json({ received: true, reportId: previous.report_id });
		}
		const now = Date.now();
		const reportId = crypto.randomUUID();
		const screenshotKey =
			screenshot instanceof File
				? `support/${reportId}/viewport.${screenshot.type === "image/webp" ? "webp" : "png"}`
				: null;
		try {
			await deps.d1.batch([
				deps.d1
					.prepare(
						"insert into support_reports (report_id, category, status, attempts, created_at, updated_at) values (?, ?, 'pending', 0, ?, ?)",
					)
					.bind(reportId, input.category, now, now),
				deps.d1
					.prepare(
						"insert into support_report_payloads (report_id, user_id, client_request_id, fingerprint, message, diagnostics, metadata, screenshot_key, received_at, expires_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
					)
					.bind(
						reportId,
						userId,
						input.clientRequestId,
						inputFingerprint,
						redactText(input.message),
						serialiseDiagnostics(input.diagnostics),
						JSON.stringify({
							route: input.diagnostics.route,
							viewport: input.diagnostics.viewport,
							online: input.diagnostics.online,
							browser: input.diagnostics.browser,
						}),
						screenshotKey,
						now,
						now + expiryMs,
					),
			]);
		} catch (error) {
			if (String(error).includes("support_rate_limited"))
				throw new SupportError(
					429,
					"Você atingiu o limite de cinco relatos em 15 minutos.",
				);
			throw error;
		}
		await ensureScreenshot(
			deps.screenshots,
			screenshotKey,
			screenshot instanceof File ? screenshot : null,
		);
		await deps.queue.send({ kind: "triage", reportId });
		await deps.d1
			.prepare(
				"update support_reports set status = 'queued', updated_at = ? where report_id = ?",
			)
			.bind(Date.now(), reportId)
			.run();
		console.info(JSON.stringify({ event: "support_accepted", reportId }));
		return Response.json({ received: true, reportId });
	} catch (error) {
		return jsonError(error);
	}
}

export async function createSupportHandler(
	request: Request,
	deps: SupportDependencies,
) {
	if (request.method !== "POST")
		return new Response("Method not allowed", {
			status: 405,
			headers: { allow: "POST" },
		});
	return acceptSupportReport(request, deps);
}
