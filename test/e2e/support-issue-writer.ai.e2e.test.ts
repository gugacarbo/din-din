import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
	parseSupportIssueWriterToolCall,
	supportIssueWriterFeedbackOptions,
	supportIssueWriterModel,
	supportIssueWriterOptions,
} from "#/server/support-issue-writer.ts";
import { publicIssueFromModel } from "#/server/support-publication-policy.ts";

const report =
	"Ao confirmar uma despesa de teste, a tela permanece carregando e não mostra o novo lançamento.";
const diagnostics = JSON.stringify({
	operation: "transaction-create",
	result: "client-request-failed",
	surface: "transaction-form",
});

describe("support issue writer against remote Workers AI", () => {
	it("calls the publication tool and receives its result", async () => {
		const output = await env.AI.run(
			supportIssueWriterModel,
			supportIssueWriterOptions(report, diagnostics),
		);

		const toolCall = parseSupportIssueWriterToolCall(output);

		expect(
			publicIssueFromModel(toolCall.arguments, [report, diagnostics]),
		).toMatchObject({
			ok: true,
		});

		const feedback = await env.AI.run(
			supportIssueWriterModel,
			supportIssueWriterFeedbackOptions(report, diagnostics, toolCall, {
				success: true,
				issueNumber: 42,
			}),
		);
		expect(feedback).toBeDefined();
	}, 60_000);
});
