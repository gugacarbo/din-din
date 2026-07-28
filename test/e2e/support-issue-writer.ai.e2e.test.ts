import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
	parseSupportIssueWriterOutput,
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
	it("returns a schema-valid and safe public issue from the real AI binding", async () => {
		const output = await env.AI.run(
			supportIssueWriterModel,
			supportIssueWriterOptions(report, diagnostics),
		);

		console.log(JSON.stringify(output, null, null, 2))

		expect(
			publicIssueFromModel(parseSupportIssueWriterOutput(output), [report, diagnostics]),
		).toMatchObject({
			ok: true,
		});
	}, 60_000);
});
