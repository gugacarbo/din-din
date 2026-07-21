import { z } from "zod";

export const supportCategories = ["problem", "question", "suggestion"] as const;
export type SupportCategory = (typeof supportCategories)[number];

export const supportCategoryLabels: Record<SupportCategory, string> = {
	problem: "Problema/erro",
	question: "Dúvida/ajuda",
	suggestion: "Sugestão",
};

const redacted = "[redacted]";
const secretKey =
	/authorization|cookie|token|secret|password|credential|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token/i;
const secretValue =
	/(?:bearer\s+)?(?:gh[pousr]_[a-z0-9_]+|eyJ[a-zA-Z0-9_-]{10,}|sk-[a-zA-Z0-9_-]{12,})/gi;

export function redactText(value: string) {
	return value
		.replace(secretValue, redacted)
		.replace(
			/https?:\/\/([^/?#]+)[^\s?#]*\?[^\s#]*/gi,
			"https://$1/[query-redacted]",
		)
		.slice(0, 1_000);
}

export function safeValue(
	value: unknown,
	depth = 0,
	seen = new WeakSet<object>(),
): unknown {
	if (depth > 4) return "[truncated]";
	if (typeof value === "string") return redactText(value);
	if (typeof value === "number" || typeof value === "boolean" || value === null)
		return value;
	if (typeof value === "bigint") return `${value}n`;
	if (typeof value === "undefined") return "[undefined]";
	if (value instanceof Error)
		return { name: value.name, message: redactText(value.message) };
	if (typeof value === "function" || typeof value === "symbol")
		return `[${typeof value}]`;
	if (typeof value !== "object") return "[unserializable]";
	if (seen.has(value)) return "[circular]";
	seen.add(value);
	if (Array.isArray(value))
		return value.slice(0, 20).map((item) => safeValue(item, depth + 1, seen));
	const output: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value).slice(0, 20))
		output[key] = secretKey.test(key)
			? redacted
			: safeValue(item, depth + 1, seen);
	return output;
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

export function normaliseRequestPath(url: string) {
	try {
		const parsed = new URL(url, window.location.origin);
		return parsed.pathname.slice(0, 500);
	} catch {
		return "/[invalid-url]";
	}
}
