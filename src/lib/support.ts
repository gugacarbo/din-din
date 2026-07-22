import { z } from "zod";

export const supportCategories = ["problem", "question", "suggestion"] as const;
export type SupportCategory = (typeof supportCategories)[number];

export const supportCategoryLabels: Record<SupportCategory, string> = {
	problem: "Problema/erro",
	question: "Dúvida/ajuda",
	suggestion: "Sugestão",
};

const redacted = "[redacted]";
const secretValue =
	/(?:bearer\s+)?(?:gh[pousr]_[a-z0-9_]+|eyJ[a-zA-Z0-9_-]{10,}|sk-[a-zA-Z0-9_-]{12,})/gi;
const cookieHeader = /\b(?:set-)?cookie\s*[=:]\s*[^\r\n]*/gi;
const authorizationHeader =
	/\bauthorization\s*[=:]\s*(?:basic|bearer)\s+[^\s,;]+/gi;
const inlineSecret =
	/\b(password|passwd|credential|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;

export const maxDiagnosticsBytes = 65_536;

export function redactText(value: string) {
	return value
		.replace(cookieHeader, "Cookie: [redacted]")
		.replace(authorizationHeader, "Authorization: [redacted]")
		.replace(inlineSecret, (_match, key: string) => `${key}=[redacted]`)
		.replace(secretValue, redacted)
		.replace(
			/https?:\/\/([^/?#]+)[^\s?#]*\?[^\s#]*/gi,
			"https://$1/[query-redacted]",
		)
		.slice(0, 1_000);
}

export function safeValue(value: unknown): unknown {
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "undefined") return "[redacted]";
	if (value instanceof Error) return { name: "Error", message: redacted };
	// Console arguments have no trustworthy schema. Preserve only booleans/null;
	// text, numbers, objects, arrays and cycles may all be form values.
	return redacted;
}

export type ConsoleDiagnostic = {
	at: number;
	level: "debug" | "info" | "log" | "warn" | "error";
	args: unknown[];
};
export type RequestDiagnostic = {
	at: number;
	method: string;
	path: string;
	status?: number;
	durationMs: number;
	result: "success" | "http_error" | "network_error" | "aborted" | "unknown";
};

export const clientDiagnosticSchema = z.object({
	console: z.array(z.custom<ConsoleDiagnostic>()).max(50),
	requests: z.array(z.custom<RequestDiagnostic>()).max(50),
	route: z.string().max(500),
	viewport: z.object({
		width: z.number().int().positive(),
		height: z.number().int().positive(),
	}),
	online: z.boolean(),
	browser: z.string().max(300),
	version: z.string().max(100).optional(),
});

export const supportInputSchema = z.object({
	category: z.enum(supportCategories),
	message: z.string().trim().min(1, "Escreva sua mensagem.").max(4_000),
	clientRequestId: z.string().uuid(),
	diagnostics: clientDiagnosticSchema,
});
export type SupportInput = z.infer<typeof supportInputSchema>;

function byteLength(value: string) {
	return new TextEncoder().encode(value).byteLength;
}

function diagnosticValue(value: unknown) {
	const safe = safeValue(value);
	try {
		return byteLength(JSON.stringify(safe)) <= 512 ? safe : "[truncated]";
	} catch {
		return "[unserializable]";
	}
}

function diagnosticNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function diagnosticPath(value: unknown) {
	try {
		return new URL(String(value), "https://support.invalid").pathname.slice(
			0,
			500,
		);
	} catch {
		return "/[invalid-url]";
	}
}

function diagnosticMethod(value: unknown) {
	const method = String(value).toUpperCase();
	return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(
		method,
	)
		? method
		: "OTHER";
}

function diagnosticResult(value: unknown): RequestDiagnostic["result"] {
	return [
		"success",
		"http_error",
		"network_error",
		"aborted",
		"unknown",
	].includes(value as string)
		? (value as RequestDiagnostic["result"])
		: "unknown";
}

/**
 * Re-sanitizes browser-provided diagnostics at the server boundary and drops
 * the oldest events deterministically until the private D1 contract fits.
 */
export function serialiseDiagnostics(diagnostics: SupportInput["diagnostics"]) {
	const console = diagnostics.console.slice(-50).map((event) => ({
		at: diagnosticNumber(event.at),
		level: ["debug", "info", "log", "warn", "error"].includes(event.level)
			? event.level
			: "log",
		args: Array.isArray(event.args)
			? event.args.slice(0, 20).map(diagnosticValue)
			: [],
	}));
	const requests = diagnostics.requests.slice(-50).map((event) => ({
		at: diagnosticNumber(event.at),
		method: diagnosticMethod(event.method),
		path: diagnosticPath(event.path),
		status: typeof event.status === "number" ? event.status : undefined,
		durationMs: diagnosticNumber(event.durationMs),
		result: diagnosticResult(event.result),
	}));
	const normalized = {
		console,
		requests,
		route: diagnosticPath(diagnostics.route),
		viewport: diagnostics.viewport,
		online: diagnostics.online,
		browser: redacted,
		version: diagnostics.version ? redacted : undefined,
	};
	let serialized = JSON.stringify(normalized);
	while (
		byteLength(serialized) > maxDiagnosticsBytes &&
		(normalized.console.length || normalized.requests.length)
	) {
		const consoleAt = normalized.console[0]?.at ?? Number.POSITIVE_INFINITY;
		const requestAt = normalized.requests[0]?.at ?? Number.POSITIVE_INFINITY;
		if (consoleAt <= requestAt) normalized.console.shift();
		else normalized.requests.shift();
		serialized = JSON.stringify(normalized);
	}
	return serialized;
}

export function metadataFromDiagnostics(serializedDiagnostics: string) {
	const diagnostics = JSON.parse(serializedDiagnostics) as {
		route: string;
		viewport: { width: number; height: number };
		online: boolean;
	};
	return JSON.stringify({
		route: diagnostics.route,
		viewport: diagnostics.viewport,
		online: diagnostics.online,
	});
}

export function normaliseRequestPath(url: string) {
	try {
		const parsed = new URL(url, window.location.origin);
		return parsed.pathname.slice(0, 500);
	} catch {
		return "/[invalid-url]";
	}
}
