import { describe, expect, it } from "vitest";

import {
	parseSupportIssueWriterOutput,
	supportIssueWriterModel,
	supportIssueWriterOptions,
} from "#/server/support-issue-writer.ts";

describe("supportIssueWriterOptions", () => {
	it("uses the production model and constrains its response with JSON Schema", () => {
		const options = supportIssueWriterOptions(
			"A confirmação de uma despesa não conclui.",
			'{"surface":"transaction-form"}',
		);

		expect(supportIssueWriterModel).toBe(
			"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
		);
		expect(options.response_format).toMatchObject({
			type: "json_schema",
			json_schema: {
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
			},
		});
	});

	it("accepts both text and structured Workers AI JSON responses", () => {
		const issue = { title: "Falha genérica" };

		expect(parseSupportIssueWriterOutput({ response: issue })).toEqual(issue);
		expect(
			parseSupportIssueWriterOutput({ response: JSON.stringify(issue) }),
		).toEqual(issue);
	});
});
