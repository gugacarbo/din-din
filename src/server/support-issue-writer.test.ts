import { describe, expect, it } from "vitest";

import {
	parseSupportIssueWriterToolCall,
	serialiseSupportIssueWriterResponse,
	supportIssueWriterFeedbackOptions,
	supportIssueWriterModel,
	supportIssueWriterOptions,
	supportIssueWriterToolName,
} from "#/server/support-issue-writer.ts";

describe("supportIssueWriterOptions", () => {
	it("uses the production model and requires the publication tool", () => {
		const options = supportIssueWriterOptions(
			"A confirmação de uma despesa não conclui.",
			'{"surface":"transaction-form"}',
		);

		expect(supportIssueWriterModel).toBe(
			"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
		);
		expect(options).not.toHaveProperty("response_format");
		expect(options.tools).toEqual([
			expect.objectContaining({
				name: supportIssueWriterToolName,
				parameters: expect.objectContaining({
					type: "object",
					additionalProperties: false,
					required: expect.arrayContaining([
						"title",
						"summary",
						"technicalCategory",
						"observedBehavior",
						"probableSteps",
						"technicalSignals",
						"labels",
					]),
				}),
			}),
		]);
	});

	it("parses native and OpenAI-compatible publication tool calls", () => {
		const issue = { title: "Falha genérica" };

		expect(
			parseSupportIssueWriterToolCall({
				tool_calls: [{ name: supportIssueWriterToolName, arguments: issue }],
			}),
		).toEqual({ name: supportIssueWriterToolName, arguments: issue });
		expect(
			parseSupportIssueWriterToolCall({
				tool_calls: [
					{
						function: {
							name: supportIssueWriterToolName,
							arguments: JSON.stringify(issue),
						},
					},
				],
			}),
		).toEqual({ name: supportIssueWriterToolName, arguments: issue });
		expect(() =>
			parseSupportIssueWriterToolCall({ response: JSON.stringify(issue) }),
		).toThrow("invalid_ai_tool_call");
	});

	it("returns the publication result to the model as a tool message", () => {
		const call = {
			name: supportIssueWriterToolName,
			arguments: { title: "Falha genérica" },
		} as const;
		const options = supportIssueWriterFeedbackOptions("Relato", "{}", call, {
			success: true,
			issueNumber: 42,
		});

		expect(options.messages.slice(-2)).toEqual([
			{ role: "assistant", content: JSON.stringify(call) },
			{
				role: "tool",
				content: JSON.stringify({ success: true, issueNumber: 42 }),
			},
		]);
	});

	it("serializes the private response without its Workers AI envelope", () => {
		expect(
			serialiseSupportIssueWriterResponse({ response: "not-json response" }),
		).toBe("not-json response");
		expect(
			serialiseSupportIssueWriterResponse({ response: { title: "Issue" } }),
		).toBe('{"title":"Issue"}');
		expect(
			serialiseSupportIssueWriterResponse({
				response: "",
				tool_calls: [
					{ name: supportIssueWriterToolName, arguments: { title: "Issue" } },
				],
			}),
		).toContain('"tool_calls"');
	});

	it("fails validation for anything that is not exactly one issue tool call", () => {
		expect(() => parseSupportIssueWriterToolCall(null)).toThrow(
			"invalid_ai_tool_call",
		);
		expect(() => parseSupportIssueWriterToolCall("text")).toThrow(
			"invalid_ai_tool_call",
		);
		expect(() => parseSupportIssueWriterToolCall({ tool_calls: [] })).toThrow(
			"invalid_ai_tool_call",
		);
		expect(() =>
			parseSupportIssueWriterToolCall({
				tool_calls: [
					{ name: "other_tool", arguments: {} },
					{
						function: {
							name: "other_tool",
							arguments: JSON.stringify({}),
						},
					},
				],
			}),
		).toThrow("invalid_ai_tool_call");
		expect(() => parseSupportIssueWriterToolCall({ tool_calls: [42] })).toThrow(
			"invalid_ai_tool_call",
		);
		expect(() =>
			parseSupportIssueWriterToolCall({
				tool_calls: [
					{
						function: {
							name: supportIssueWriterToolName,
							arguments: "{not-json",
						},
					},
				],
			}),
		).toThrow(SyntaxError);
	});

	it("serializes long and unserializable responses without throwing", () => {
		const long = "x".repeat(32_001);
		const serialised = serialiseSupportIssueWriterResponse({ response: long });
		expect(serialised).toHaveLength(32_000);
		expect(serialiseSupportIssueWriterResponse("plain")).toBe("plain");

		const circular: Record<string, unknown> = {
			response: { title: "Issue" },
		};
		circular.self = circular;
		const object = circular.response as Record<string, unknown>;
		// response is a plain object, so circularity must come from it
		object.self = object;
		expect(serialiseSupportIssueWriterResponse(circular)).toBe(
			"[unserializable_ai_response]",
		);
	});

	it("feeds the manual-review result back as a tool message", () => {
		const call = {
			name: supportIssueWriterToolName,
			arguments: { title: "Falha genérica" },
		} as const;
		const options = supportIssueWriterFeedbackOptions("Relato", "{}", call, {
			success: false,
			status: "manual_review",
		});
		expect(options.max_tokens).toBe(120);
		expect(options.messages.at(-1)).toEqual({
			role: "tool",
			content: JSON.stringify({ success: false, status: "manual_review" }),
		});
	});
});
