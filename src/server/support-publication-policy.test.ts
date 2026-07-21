import { describe, expect, it } from "vitest";
import { publicIssueFromModel } from "#/server/support-publication-policy.ts";

const valid = {
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
	});
	it("rejeita eco longo de conteúdo privado mesmo com schema válido", () => {
		const secret =
			"o usuário escreveu uma sequência privada que não pode ser publicada em lugar algum";
		expect(
			publicIssueFromModel({ ...valid, summary: secret }, [secret]),
		).toEqual({ ok: false, reason: "unsafe_public_content" });
	});
});
