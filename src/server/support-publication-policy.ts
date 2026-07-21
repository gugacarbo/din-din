import { z } from "zod";
import { redactText } from "#/lib/support.ts";

const plainText = z.string().trim().min(1).max(800);
const aiOutput = z
	.object({
		title: plainText.max(120),
		summary: plainText,
		technicalCategory: z.enum(["bug", "question", "suggestion"]),
		observedBehavior: plainText,
		probableSteps: z.array(plainText.max(240)).max(5),
		technicalSignals: z.array(plainText.max(240)).max(8),
		labels: z.array(z.enum(["bug", "enhancement", "question"])).max(3),
	})
	.strict();
export type PublicIssue = z.infer<typeof aiOutput>;

const unsafe =
	/(?:https?:\/\/|www\.|<[^>]+>|!\[|\]\(|@\w+|#\d+|`{1,3}|\[.+\]\(.+\))/i;
const pii =
	/\b(?:\d{3}[. -]?\d{3}[. -]?\d{3}[ -]?\d{2}|\d{11,14}|[\w.+-]+@[\w.-]+\.[a-z]{2,})\b/i;
function tokens(value: string) {
	return value.toLocaleLowerCase("pt-BR").split(/\s+/).filter(Boolean);
}
function echoes(value: string, privateValues: string[]) {
	const lower = value.toLocaleLowerCase("pt-BR");
	return privateValues.some((item) => {
		const clean = item.trim().toLocaleLowerCase("pt-BR");
		if (clean.length >= 32 && lower.includes(clean)) return true;
		const input = tokens(clean);
		for (let index = 0; index + 6 <= input.length; index++)
			if (lower.includes(input.slice(index, index + 6).join(" "))) return true;
		return false;
	});
}

export function publicIssueFromModel(
	value: unknown,
	privateValues: string[],
): { ok: true; value: PublicIssue } | { ok: false; reason: string } {
	const parsed = aiOutput.safeParse(value);
	if (!parsed.success) return { ok: false, reason: "invalid_ai_output" };
	const all = [
		parsed.data.title,
		parsed.data.summary,
		parsed.data.observedBehavior,
		...parsed.data.probableSteps,
		...parsed.data.technicalSignals,
	];
	if (
		all.some(
			(part) =>
				unsafe.test(part) ||
				pii.test(part) ||
				redactText(part) !== part ||
				echoes(part, privateValues),
		)
	)
		return { ok: false, reason: "unsafe_public_content" };
	return { ok: true, value: parsed.data };
}

export function issueMarkdown(issue: PublicIssue, marker: string) {
	return `<!-- support-report:${marker} -->\n\n## Resumo\n\n${issue.summary}\n\n## Comportamento observado\n\n${issue.observedBehavior}\n\n## Passos prováveis\n\n${issue.probableSteps.map((step) => `- ${step}`).join("\n")}\n\n## Sinais técnicos agregados\n\n${issue.technicalSignals.map((signal) => `- ${signal}`).join("\n")}`;
}
