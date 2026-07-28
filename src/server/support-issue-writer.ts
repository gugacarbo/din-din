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

export const supportIssueWriterToolName = "publish_support_issue";

const supportIssueWriterTool = {
	name: supportIssueWriterToolName,
	description:
		"Publish one generalized, privacy-safe technical support issue. The tool returns whether publication succeeded.",
	parameters: supportIssueWriterSchema,
} as const;

export type SupportIssueWriterToolCall = {
	name: typeof supportIssueWriterToolName;
	arguments: unknown;
};

export type SupportIssueWriterToolResult =
	| { success: true; issueNumber: number }
	| { success: false; status: "manual_review" };

/**
 * Builds the first Workers AI request used by the support issue writer.
 * The issue is returned as a tool call so the publication result can be sent
 * back to the model in the same conversation.
 */
export function supportIssueWriterOptions(
	message: string,
	diagnostics: string,
) {
	return {
		messages: [
			{
				role: "system",
				content:
					"Create a public support issue by calling publish_support_issue exactly once. Never return the issue as text or JSON outside the tool call. Write a new, generalized technical description: never reuse a sequence of four or more words from the user report, and do not include personal data, URLs, markdown, mentions, or secrets. After a tool result is provided, acknowledge whether publication succeeded without calling the tool again.",
			},
			{
				role: "user",
				content: `User report: ${message}\nSanitized diagnostics: ${diagnostics}`,
			},
		],
		tools: [supportIssueWriterTool],
		max_tokens: 800,
	};
}

/** Builds the follow-up request that tells the model how its tool call ended. */
export function supportIssueWriterFeedbackOptions(
	message: string,
	diagnostics: string,
	toolCall: SupportIssueWriterToolCall,
	result: SupportIssueWriterToolResult,
) {
	const initial = supportIssueWriterOptions(message, diagnostics);
	return {
		...initial,
		messages: [
			...initial.messages,
			{ role: "assistant", content: JSON.stringify(toolCall) },
			{ role: "tool", content: JSON.stringify(result) },
		],
		max_tokens: 120,
	};
}

const maxPrivateResponseLength = 32_000;

function responseFromOutput(output: unknown) {
	if (typeof output === "object" && output !== null && "tool_calls" in output)
		return { tool_calls: output.tool_calls };
	return typeof output === "object" && output !== null && "response" in output
		? output.response
		: output;
}

/** Serializes model output for the admin-only, retention-bound support payload. */
export function serialiseSupportIssueWriterResponse(output: unknown): string {
	const response = responseFromOutput(output);
	if (typeof response === "string")
		return response.slice(0, maxPrivateResponseLength);
	try {
		return (JSON.stringify(response) ?? String(response)).slice(
			0,
			maxPrivateResponseLength,
		);
	} catch {
		return "[unserializable_ai_response]";
	}
}

function parseArguments(value: unknown): unknown {
	return typeof value === "string" ? JSON.parse(value) : value;
}

/** Requires exactly one call to the issue publication tool. */
export function parseSupportIssueWriterToolCall(
	output: unknown,
): SupportIssueWriterToolCall {
	if (
		typeof output !== "object" ||
		output === null ||
		!("tool_calls" in output)
	)
		throw new Error("invalid_ai_tool_call");
	const calls = output.tool_calls;
	if (!Array.isArray(calls) || calls.length !== 1)
		throw new Error("invalid_ai_tool_call");
	const call = calls[0];
	if (typeof call !== "object" || call === null)
		throw new Error("invalid_ai_tool_call");

	if (
		"name" in call &&
		call.name === supportIssueWriterToolName &&
		"arguments" in call
	)
		return {
			name: supportIssueWriterToolName,
			arguments: parseArguments(call.arguments),
		};

	if (
		"function" in call &&
		typeof call.function === "object" &&
		call.function
	) {
		const fn = call.function as Record<string, unknown>;
		if (fn.name === supportIssueWriterToolName && "arguments" in fn)
			return {
				name: supportIssueWriterToolName,
				arguments: parseArguments(fn.arguments),
			};
	}
	throw new Error("invalid_ai_tool_call");
}
