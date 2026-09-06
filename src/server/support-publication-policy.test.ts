import { describe, expect, it } from "vitest";
import type { PublicIssue } from "#/server/support-publication-policy.ts";
import {
	issueMarkdown,
	publicIssueFromModel,
} from "#/server/support-publication-policy.ts";

const valid: PublicIssue = {
	title: "Falha ao salvar lançamento",
	summary: "O salvamento retorna uma falha sem expor dados privados.",
	technicalCategory: "bug",
	observedBehavior: "A ação termina sem concluir o registro.",
	probableSteps: ["Abrir lançamentos", "Salvar um registro válido"],
	technicalSignals: ["Uma requisição retornou erro 500"],
	labels: ["bug"],
};

describe("publicIssueFromModel", () => {
	it("permite somente conteúdo estruturado e texto plano", () => {
		expect(
			publicIssueFromModel(valid, ["mensagem privada que não aparece aqui"]),
		).toEqual({ ok: true, value: valid });
	});
	it("falha fechada para URLs, PII e markdown ativo", () => {
		expect(
			publicIssueFromModel(
				{ ...valid, summary: "Veja https://example.com" },
				[],
			),
		).toMatchObject({ ok: false });
		expect(
			publicIssueFromModel({ ...valid, summary: "Email ana@example.com" }, []),
		).toMatchObject({ ok: false });
		expect(
			publicIssueFromModel(
				{ ...valid, observedBehavior: "[clique](https://x.test)" },
				[],
			),
		).toMatchObject({ ok: false });
		expect(
			publicIssueFromModel(
				{ ...valid, summary: "Cartão 4111 1111 1111 1111" },
				[],
			),
		).toMatchObject({ ok: false });
		expect(
			publicIssueFromModel(
				{ ...valid, summary: "## Cabeçalho\n**ênfase**" },
				[],
			),
		).toMatchObject({ ok: false });
	});
	it("rejeita telefones e referências GitHub em todos os campos após normalizar Unicode", () => {
		const unsafe = [
			"Telefone (11) 99876-5432",
			"Telefone +1 (415) 555-2671",
			"Telefone (415) 555-2671",
			"Telefone 415.555.2671",
			"Telefone 555-2671",
			"Telefone 123 456 7890",
			"Telefone 0049 30 123456",
			"Telefone 01 234 567 890",
			"CNPJ 12.345.678/0001-95",
			"Acesse example.com/path",
			"Veja a issue #123",
			"Veja gugacarbo/din-din#123",
			"Telefone\u00a0(11)\u200799876‑5432",
			"Referência\u00a0#\u2007123",
		];
		for (const field of [
			"title",
			"summary",
			"observedBehavior",
			"probableSteps",
			"technicalSignals",
		] as const)
			for (const value of unsafe) {
				const candidate =
					field === "probableSteps" || field === "technicalSignals"
						? { ...valid, [field]: [value] }
						: { ...valid, [field]: value };
				expect(publicIssueFromModel(candidate, [])).toMatchObject({
					ok: false,
				});
			}
	});
	it("rejeita eco longo de conteúdo privado mesmo com schema válido", () => {
		const secret =
			"o usuário escreveu uma sequência privada que não pode ser publicada em lugar algum";
		expect(
			publicIssueFromModel({ ...valid, summary: secret }, [secret]),
		).toEqual({ ok: false, reason: "unsafe_public_content" });
	});
	it("rejeita saídas fora do schema estrito com motivo explícito", () => {
		expect(publicIssueFromModel(null, [])).toEqual({
			ok: false,
			reason: "invalid_ai_output",
		});
		expect(publicIssueFromModel({ ...valid, title: "   " }, [])).toMatchObject({
			ok: false,
		});
		expect(
			publicIssueFromModel({ ...valid, title: "x".repeat(121) }, []),
		).toMatchObject({ ok: false });
		expect(
			publicIssueFromModel({ ...valid, technicalCategory: "incident" }, []),
		).toMatchObject({ ok: false });
		expect(
			publicIssueFromModel(
				{ ...valid, labels: [...valid.labels, "bug", "bug", "bug"] },
				[],
			),
		).toMatchObject({ ok: false });
		expect(
			publicIssueFromModel(
				{ ...valid, probableSteps: ["passo", "x".repeat(241)] },
				[],
			),
		).toMatchObject({ ok: false });
		expect(
			publicIssueFromModel(
				{
					...valid,
					probableSteps: Array.from({ length: 6 }, (_, i) => `passo ${i}`),
				},
				[],
			),
		).toMatchObject({ ok: false });
		expect(
			publicIssueFromModel(
				{
					...valid,
					technicalSignals: Array.from({ length: 9 }, (_, i) => `sinal ${i}`),
				},
				[],
			),
		).toMatchObject({ ok: false });
		expect(
			publicIssueFromModel(
				{ ...valid, extraField: "campos extra são rejeitados" },
				[],
			),
		).toMatchObject({ ok: false });
	});
	it("renderiza a issue pública com o marcador do relato", () => {
		const markdown = issueMarkdown(valid, "report-42");
		expect(markdown).toContain("<!-- support-report:report-42 -->");
		expect(markdown).toContain("## Resumo");
		expect(markdown).toContain("- Abrir lançamentos");
		expect(markdown).toContain("- Uma requisição retornou erro 500");
	});
});
