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
});
