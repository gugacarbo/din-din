import { describe, expect, it, vi } from "vitest";
import {
	githubRequestFailuresFromError,
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
	it("preserves a sanitized installation-token HTTP failure", async () => {
		const fetcher = vi.fn(async () =>
			Response.json(
				{ message: "Bad credentials", token: "must-not-be-recorded" },
				{
					status: 401,
					headers: { "x-github-request-id": "GH-REQUEST-123" },
				},
			),
		);
		let failure: unknown;
		try {
			await publishSupportIssue(
				{
					GITHUB_APP_ID: "1",
					GITHUB_APP_INSTALLATION_ID: "2",
					GITHUB_APP_PRIVATE_KEY: await privateKey(),
				},
				"report-1",
				issue,
				fetcher as typeof fetch,
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).toMatchObject({
			message: "github_installation_token_failed",
		});
		expect(githubRequestFailuresFromError(failure)).toEqual([
			{
				stage: "installation_token",
				method: "POST",
				endpoint: "/app/installations/[installation-id]/access_tokens",
				status: 401,
				requestId: "GH-REQUEST-123",
				message: "Bad credentials",
			},
		]);
		expect(
			JSON.stringify(githubRequestFailuresFromError(failure)),
		).not.toContain("must-not-be-recorded");
		expect(fetcher).toHaveBeenCalledWith(
			expect.stringContaining("/access_tokens"),
			expect.objectContaining({
				headers: expect.objectContaining({
					"user-agent": "din-din-support-issue-writer",
				}),
			}),
		);
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
		).resolves.toMatchObject({
			number: 42,
			url: "https://github.com/gugacarbo/din-din/issues/42",
			requestFailures: [
				expect.objectContaining({
					stage: "issue_creation",
					status: null,
				}),
			],
		});
		expect(
			fetcher.mock.calls.filter(([url]) => String(url).endsWith("/issues")),
		).toHaveLength(1);
		for (const call of fetcher.mock.calls) {
			const [, init] = call as unknown as [RequestInfo | URL, RequestInit];
			expect(init).toEqual(
				expect.objectContaining({
					headers: expect.objectContaining({
						"user-agent": "din-din-support-issue-writer",
					}),
				}),
			);
		}
	});
});
