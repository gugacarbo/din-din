export const supportIssueWriterModel =
	"@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const supportIssueWriterSchema = {
	type: "object",
	additionalProperties: false,
	required: [
		"title",
		"summary",
		"technicalCategory",
		"observedBehavior",
		"probableSteps",
		"technicalSignals",
		"labels",
	],
	properties: {
		title: { type: "string", minLength: 1, maxLength: 120 },
		summary: { type: "string", minLength: 1, maxLength: 800 },
		technicalCategory: {
			type: "string",
			enum: ["bug", "question", "suggestion"],
		},
		observedBehavior: { type: "string", minLength: 1, maxLength: 800 },
		probableSteps: {
			type: "array",
			maxItems: 5,
			items: { type: "string", minLength: 1, maxLength: 240 },
		},
		technicalSignals: {
			type: "array",
			maxItems: 8,
			items: { type: "string", minLength: 1, maxLength: 240 },
		},
		labels: {
			type: "array",
			maxItems: 3,
			items: {
				type: "string",
				enum: ["bug", "enhancement", "question"],
			},
		},
	},
} as const;

/**
 * Builds the exact Workers AI request used by the support issue writer.
 * JSON Schema constrains the adapter response itself; `json_object` only
 * guarantees syntactically valid JSON and can still omit required fields.
 */
export function supportIssueWriterOptions(
	message: string,
	diagnostics: string,
) {
	return {
		prompt: `Produce only a JSON object that matches the provided JSON Schema. The output will be public, so write a new, generalized technical description: never reuse a sequence of four or more words from the user report, and do not include personal data, URLs, markdown, mentions, or secrets.\nUser report: ${message}\nSanitized diagnostics: ${diagnostics}`,
		response_format: {
			type: "json_schema" as const,
			json_schema: supportIssueWriterSchema,
		},
		max_tokens: 800,
	};
}

/** Normalizes text-mode and structured-mode Workers AI responses. */
export function parseSupportIssueWriterOutput(output: unknown): unknown {
	const response =
		typeof output === "object" && output !== null && "response" in output
			? output.response
			: output;
	if (typeof response === "string") return JSON.parse(response);
	if (typeof response === "object" && response !== null) return response;
	throw new Error("invalid_ai_output");
}
