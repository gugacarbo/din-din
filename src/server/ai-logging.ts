/**
 * Wrapper para `env.AI.run` com persistência de métricas de uso no D1.
 *
 * Registra modelo, tokens (input/output/total), TTFT, duração, sucesso e erro
 * na tabela `ai_invocations` (ADR-0011). A persistência é best-effort: falha
 * ao gravar o log nunca derruba a invocação de AI.
 *
 * ⚠️ Nunca logar o conteúdo do prompt ou qualquer dado privado — somente
 * metadados de uso.
 */

import { redactText } from "#/lib/support.ts";

type AiRunOptions = Record<string, unknown>;

/** Forma esperada do retorno de env.AI.run para modelos de texto. */
type AiTextResult = {
	response?: string;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
};

export type AiInvocationLog = {
	id: string;
	model: string;
	agentKey: string;
	userId: string | null;
	reportId: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
	ttftMs: number | null;
	durationMs: number;
	success: boolean;
	errorMessage: string | null;
	metadata: string | null;
	createdAt: number;
};

export type AiInvocationContext = {
	/** ID gerado pelo chamador para correlacionar AI, validação e publicação. */
	invocationId?: string;
	/** Identifica qual agente/processo disparou a invocação (ex.: "issue-writer"). */
	agentKey: string;
	/** ID do usuário que originou a invocação, se aplicável. */
	userId?: string;
	/** ID do relato de suporte correlacionado, se aplicável. */
	reportId?: string;
	/** Metadados adicionais livres (objeto serializado para JSON). */
	metadata?: Record<string, unknown>;
};

type SafeErrorDetails = {
	type: string;
	message: string;
	code?: string | number;
	status?: number;
	requestId?: string;
	retryable?: boolean;
	stack?: string;
	cause?: { type: string; message: string };
	providerErrors?: Array<{ code?: string | number; message: string }>;
};

function safeText(value: unknown, fallback: string) {
	const text = redactText(typeof value === "string" ? value : String(value));
	return text || fallback;
}

/** Extracts useful provider diagnostics while redacting and bounding text. */
export function safeAiErrorDetails(error: unknown): SafeErrorDetails {
	if (typeof error !== "object" || error === null) {
		return { type: typeof error, message: safeText(error, "unknown_error") };
	}
	const record = error as Record<string, unknown>;
	const details: SafeErrorDetails = {
		type: safeText(record.name ?? error.constructor?.name ?? "Error", "Error"),
		message: safeText(record.message ?? "unknown_error", "unknown_error"),
	};
	if (typeof record.code === "string" || typeof record.code === "number")
		details.code =
			typeof record.code === "string"
				? safeText(record.code, "unknown")
				: record.code;
	if (typeof record.status === "number" && Number.isFinite(record.status))
		details.status = record.status;
	if (typeof record.requestId === "string")
		details.requestId = safeText(record.requestId, "unknown");
	if (typeof record.retryable === "boolean")
		details.retryable = record.retryable;
	if (typeof record.stack === "string")
		details.stack = safeText(record.stack, "unavailable");
	if (typeof record.cause === "object" && record.cause !== null) {
		const cause = record.cause as Record<string, unknown>;
		details.cause = {
			type: safeText(
				cause.name ?? record.cause.constructor?.name ?? "Error",
				"Error",
			),
			message: safeText(cause.message ?? "unknown_error", "unknown_error"),
		};
	}
	if (Array.isArray(record.errors)) {
		details.providerErrors = record.errors.slice(0, 5).flatMap((item) => {
			if (typeof item !== "object" || item === null) return [];
			const providerError = item as Record<string, unknown>;
			const entry: { code?: string | number; message: string } = {
				message: safeText(
					providerError.message ?? "unknown_error",
					"unknown_error",
				),
			};
			if (
				typeof providerError.code === "string" ||
				typeof providerError.code === "number"
			)
				entry.code =
					typeof providerError.code === "string"
						? safeText(providerError.code, "unknown")
						: providerError.code;
			return [entry];
		});
	}
	return details;
}

/** Describes the response envelope without retaining model-generated content. */
export function safeAiOutputDetails(output: unknown) {
	const response =
		typeof output === "object" && output !== null && "response" in output
			? output.response
			: output;
	return {
		outputType: Array.isArray(output) ? "array" : typeof output,
		responseType: Array.isArray(response) ? "array" : typeof response,
		responseLength: typeof response === "string" ? response.length : null,
	};
}

/**
 * Invoca `env.AI.run` e registra métricas de uso no D1.
 *
 * @param env Ambiente do Worker (precisa de `AI` e `DB`).
 * @param model Identificador do modelo (ex.: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
 * @param options Argumentos repassados para `env.AI.run`.
 * @param context Contexto obrigatório para correlação (`agentKey` + opcionais).
 * @returns O objeto retornado por `env.AI.run`.
 */
export async function runAiWithLogging<T = unknown>(
	env: { AI: Ai; DB: D1Database },
	model: string,
	options: AiRunOptions,
	context: AiInvocationContext,
): Promise<T> {
	const id = context.invocationId ?? crypto.randomUUID();
	const userId = context.userId ?? null;
	const reportId = context.reportId ?? null;
	const metadata = context.metadata ? JSON.stringify(context.metadata) : null;
	const startedAt = Date.now();
	let output: T;
	console.info(
		JSON.stringify({
			event: "ai_invocation_started",
			invocationId: id,
			model,
			agentKey: context.agentKey,
			reportId,
		}),
	);

	try {
		const result = await env.AI.run(model, options as never);
		// TTFT aproximado: tempo até a promise resolver. Workers AI não expõe
		// TTFT granular no retorno; usamos a duração total como aproximação
		// quando o campo não está disponível.
		const ttftMs = Date.now() - startedAt;
		output = result as T;
		await persistLog(env, {
			id,
			model,
			agentKey: context.agentKey,
			userId,
			reportId,
			inputTokens: extractTokens(result, "prompt_tokens"),
			outputTokens: extractTokens(result, "completion_tokens"),
			totalTokens: extractTokens(result, "total_tokens"),
			ttftMs,
			durationMs: Date.now() - startedAt,
			success: true,
			errorMessage: null,
			metadata,
			createdAt: startedAt,
		});
		console.info(
			JSON.stringify({
				event: "ai_invocation_succeeded",
				invocationId: id,
				model,
				agentKey: context.agentKey,
				reportId,
				durationMs: Date.now() - startedAt,
				inputTokens: extractTokens(result, "prompt_tokens"),
				outputTokens: extractTokens(result, "completion_tokens"),
				totalTokens: extractTokens(result, "total_tokens"),
				...safeAiOutputDetails(result),
			}),
		);
		return output;
	} catch (error) {
		const errorDetails = safeAiErrorDetails(error);
		await persistLog(env, {
			id,
			model,
			agentKey: context.agentKey,
			userId,
			reportId,
			inputTokens: null,
			outputTokens: null,
			totalTokens: null,
			ttftMs: null,
			durationMs: Date.now() - startedAt,
			success: false,
			errorMessage: errorDetails.message,
			metadata,
			createdAt: startedAt,
		});
		console.error(
			JSON.stringify({
				event: "ai_invocation_failed",
				invocationId: id,
				model,
				agentKey: context.agentKey,
				reportId,
				durationMs: Date.now() - startedAt,
				error: errorDetails,
			}),
		);
		throw error;
	}
}

function extractTokens(
	result: unknown,
	field: "prompt_tokens" | "completion_tokens" | "total_tokens",
): number | null {
	if (
		typeof result === "object" &&
		result !== null &&
		"usage" in result &&
		typeof result.usage === "object" &&
		result.usage !== null &&
		field in result.usage
	) {
		const value = (result.usage as Record<string, unknown>)[field];
		return typeof value === "number" ? value : null;
	}
	return null;
}

async function persistLog(
	env: { DB: D1Database },
	log: AiInvocationLog,
): Promise<void> {
	try {
		await env.DB.prepare(
			"insert into ai_invocations (id, model, agent_key, user_id, report_id, input_tokens, output_tokens, total_tokens, ttft_ms, duration_ms, success, error_message, metadata, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		)
			.bind(
				log.id,
				log.model,
				log.agentKey,
				log.userId,
				log.reportId,
				log.inputTokens,
				log.outputTokens,
				log.totalTokens,
				log.ttftMs,
				log.durationMs,
				log.success ? 1 : 0,
				log.errorMessage,
				log.metadata,
				log.createdAt,
			)
			.run();
	} catch (error) {
		// Best-effort: falha ao gravar o log não derruba a triagem.
		console.error(
			JSON.stringify({
				event: "ai_invocation_log_failed",
				model: log.model,
				agentKey: log.agentKey,
				reportId: log.reportId,
				reason: error instanceof Error ? error.message : String(error),
			}),
		);
	}
}

/** Tipo auxiliar para consumers que precisam do resultado textual. */
export function asTextResult(output: unknown): AiTextResult {
	if (typeof output === "string") return { response: output };
	if (typeof output === "object" && output !== null)
		return output as AiTextResult;
	return {};
}
