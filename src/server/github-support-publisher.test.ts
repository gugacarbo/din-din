import { describe, expect, it, vi } from "vitest";
import {
	pemBytes,
	publishSupportIssue,
} from "#/server/github-support-publisher.ts";

const issue = {
	title: "Falha ao salvar lançamento",
	summary: "Uma ação não conclui o salvamento.",
	technicalCategory: "bug" as const,
	observedBehavior: "O registro não é concluído.",
	probableSteps: ["Abrir lançamentos"],
	technicalSignals: ["Erro de rede agregado"],
	labels: ["bug" as const],
};

async function privateKey() {
	const pair = await crypto.subtle.generateKey(
		{
			name: "RSASSA-PKCS1-v1_5",
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["sign", "verify"],
	);
	const encoded = btoa(
		String.fromCharCode(
			...new Uint8Array(
				await crypto.subtle.exportKey("pkcs8", pair.privateKey),
			),
		),
	);
	return `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----`;
}

describe("publishSupportIssue", () => {
	it("rejects encrypted and malformed PEM without exposing its contents", () => {
		expect(() =>
			pemBytes(
				"-----BEGIN ENCRYPTED PRIVATE KEY-----\nsecret\n-----END ENCRYPTED PRIVATE KEY-----",
			),
		).toThrow("github_private_key_encrypted");
		expect(() => pemBytes("not-a-pem")).toThrow("github_private_key_format");
	});
	it("reconciles a timeout after POST without issuing a second POST", async () => {
		let searches = 0;
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("access_tokens"))
				return Response.json({ token: "installation-token" });
			if (url.includes("/search/issues")) {
				searches += 1;
				return Response.json(
					searches === 1
						? { items: [] }
						: {
								items: [
									{
										number: 42,
										html_url: "https://github.com/gugacarbo/din-din/issues/42",
									},
								],
							},
				);
			}
			throw new Error("post timeout after request reached GitHub");
		});
		await expect(
			publishSupportIssue(
				{
					GITHUB_APP_ID: "1",
					GITHUB_APP_INSTALLATION_ID: "2",
					GITHUB_APP_PRIVATE_KEY: await privateKey(),
				},
				"report-1",
				issue,
				fetcher as typeof fetch,
			),
		).resolves.toEqual({
			number: 42,
			url: "https://github.com/gugacarbo/din-din/issues/42",
		});
		expect(
			fetcher.mock.calls.filter(([url]) => String(url).endsWith("/issues")),
		).toHaveLength(1);
	});
});
