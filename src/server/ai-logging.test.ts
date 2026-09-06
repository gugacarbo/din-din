import { describe, expect, it } from "vitest";

import {
	safeAiErrorDetails,
	safeAiOutputDetails,
} from "#/server/ai-logging.ts";

describe("AI observability safeguards", () => {
	it("keeps provider diagnostics and redacts secrets", () => {
		const error = Object.assign(
			new Error("request failed token=secret-value"),
			{
				code: "AI_UPSTREAM",
				status: 503,
				requestId: "request-123",
				retryable: true,
				errors: [
					{ code: 1001, message: "Authorization: Bearer ghp_sensitive" },
				],
			},
		);

		expect(safeAiErrorDetails(error)).toMatchObject({
			type: "Error",
			message: "request failed token=[redacted]",
			code: "AI_UPSTREAM",
			status: 503,
			requestId: "request-123",
			retryable: true,
			providerErrors: [{ code: 1001, message: "Authorization: [redacted]" }],
		});
		expect(JSON.stringify(safeAiErrorDetails(error))).not.toContain(
			"secret-value",
		);
		expect(JSON.stringify(safeAiErrorDetails(error))).not.toContain(
			"ghp_sensitive",
		);
	});

	it("describes model output without logging its content", () => {
		const privateOutput = "private model output";
		const details = safeAiOutputDetails({ response: privateOutput });

		expect(details).toEqual({
			outputType: "object",
			responseType: "string",
			responseLength: privateOutput.length,
		});
		expect(JSON.stringify(details)).not.toContain(privateOutput);
	});

	it("handles non-Error, null and circular failures without leaking secrets", () => {
		expect(safeAiErrorDetails("boom token=ghp_abc123").message).toBe(
			"boom token=[redacted]",
		);
		expect(safeAiErrorDetails(null)).toMatchObject({
			type: "object",
			message: "null",
		});

		const circular = Object.assign(
			new Error("token=sk-abcdef123456") as object,
			{
				code: "AI_RATE_LIMIT",
				requestId: "Authorization: Bearer sk-abcdef123456",
				retryable: true,
				cause: new Error("cookie: session=token123"),
			},
		);
		(circular as Record<string, unknown>).circular = circular;
		const details = safeAiErrorDetails(circular);
		expect(details).toMatchObject({
			code: "AI_RATE_LIMIT",
			retryable: true,
			cause: { message: "Cookie: [redacted]" },
		});
		expect(JSON.stringify(details)).not.toContain("sk-abcdef123456");
	});

	it("ignores diagnostics with the wrong shape", () => {
		const details = safeAiErrorDetails({
			name: "TypeError",
			status: Number.NaN,
			retryable: "yes",
			requestId: 42,
			errors: [
				"plain string",
				42,
				{ code: "E1", message: "Authorization: Bearer ghp_sensitive" },
				{ message: "token=sk-secret2" },
			],
		});
		expect(details).not.toHaveProperty("status");
		expect(details).not.toHaveProperty("retryable");
		expect(details).not.toHaveProperty("requestId");
		expect(details.providerErrors).toEqual([
			{ code: "E1", message: "Authorization: [redacted]" },
			{ message: "token=[redacted]" },
		]);
	});

	it("describes non-string, non-object and array model outputs safely", () => {
		expect(safeAiOutputDetails("abc")).toEqual({
			outputType: "string",
			responseType: "string",
			responseLength: 3,
		});
		expect(safeAiOutputDetails(null)).toEqual({
			outputType: "object",
			responseType: "object",
			responseLength: null,
		});
		expect(safeAiOutputDetails([1, 2])).toEqual({
			outputType: "array",
			responseType: "array",
			responseLength: null,
		});
		expect(safeAiOutputDetails({ response: 7 })).toEqual({
			outputType: "object",
			responseType: "number",
			responseLength: null,
		});
	});
});
