import { redactText } from "#/lib/support.ts";
import {
	issueMarkdown,
	type PublicIssue,
} from "#/server/support-publication-policy.ts";

const repository = "gugacarbo/din-din";
const api = "https://api.github.com";
type Fetcher = typeof fetch;

export type GitHubRequestFailure = {
	stage:
		| "installation_token"
		| "reconciliation_before_post"
		| "issue_creation"
		| "reconciliation_after_post";
	method: "GET" | "POST";
	endpoint: string;
	status: number | null;
	requestId: string | null;
	message: string;
};

class GitHubPublicationError extends Error {
	constructor(
		message: string,
		readonly requestFailures: GitHubRequestFailure[],
	) {
		super(message);
		this.name = "GitHubPublicationError";
	}
}

export function githubRequestFailuresFromError(
	error: unknown,
): GitHubRequestFailure[] {
	return error instanceof GitHubPublicationError ? error.requestFailures : [];
}

function safeFailureMessage(value: unknown, fallback: string) {
	if (typeof value !== "string") return fallback;
	return redactText(value).slice(0, 1_000) || fallback;
}

async function responseFailure(
	response: Response,
	context: Pick<GitHubRequestFailure, "stage" | "method" | "endpoint">,
): Promise<GitHubRequestFailure> {
	let message = `GitHub respondeu HTTP ${response.status}.`;
	try {
		const body = (await response.clone().json()) as { message?: unknown };
		message = safeFailureMessage(body.message, message);
	} catch {
		// The status and GitHub request ID still identify non-JSON failures.
	}
	return {
		...context,
		status: response.status,
		requestId: response.headers.get("x-github-request-id"),
		message,
	};
}

function networkFailure(
	error: unknown,
	context: Pick<GitHubRequestFailure, "stage" | "method" | "endpoint">,
): GitHubRequestFailure {
	return {
		...context,
		status: null,
		requestId: null,
		message: safeFailureMessage(
			error instanceof Error ? error.message : String(error),
			"Falha de rede sem resposta do GitHub.",
		),
	};
}
function base64url(value: Uint8Array | string) {
	const text =
		typeof value === "string" ? value : String.fromCharCode(...value);
	return btoa(text)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}
function derLength(length: number) {
	if (length < 128) return Uint8Array.of(length);
	const bytes: number[] = [];
	for (let value = length; value > 0; value >>>= 8) bytes.unshift(value & 0xff);
	return Uint8Array.of(0x80 | bytes.length, ...bytes);
}
function der(tag: number, body: Uint8Array) {
	return Uint8Array.of(tag, ...derLength(body.length), ...body);
}
function pkcs1ToPkcs8(pkcs1: Uint8Array) {
	const rsaEncryption = Uint8Array.of(
		0x30,
		0x0d,
		0x06,
		0x09,
		0x2a,
		0x86,
		0x48,
		0x86,
		0xf7,
		0x0d,
		0x01,
		0x01,
		0x01,
		0x05,
		0x00,
	);
	return der(
		0x30,
		Uint8Array.of(0x02, 0x01, 0x00, ...rsaEncryption, ...der(0x04, pkcs1)),
	);
}
export function pemBytes(pem: string) {
	const normalized = pem.replaceAll("\\n", "\n").trim();
	if (/BEGIN ENCRYPTED PRIVATE KEY|Proc-Type:|DEK-Info:/i.test(normalized))
		throw new Error("github_private_key_encrypted");
	const pkcs1 = normalized.startsWith("-----BEGIN RSA PRIVATE KEY-----");
	const pkcs8 = normalized.startsWith("-----BEGIN PRIVATE KEY-----");
	if (!pkcs1 && !pkcs8) throw new Error("github_private_key_format");
	const footer = pkcs1
		? "-----END RSA PRIVATE KEY-----"
		: "-----END PRIVATE KEY-----";
	if (!normalized.endsWith(footer))
		throw new Error("github_private_key_format");
	const body = normalized
		.replaceAll("\\n", "\n")
		.replace(/-----[^-]+-----/g, "")
		.replace(/\s/g, "");
	try {
		const binary = atob(body);
		const bytes = Uint8Array.from(binary, (character) =>
			character.charCodeAt(0),
		);
		return pkcs1 ? pkcs1ToPkcs8(bytes) : bytes;
	} catch {
		throw new Error("github_private_key_format");
	}
}
async function appJwt(appId: string, privateKey: string) {
	const now = Math.floor(Date.now() / 1_000);
	const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = base64url(
		JSON.stringify({ iat: now - 30, exp: now + 540, iss: appId }),
	);
	const key = await crypto.subtle.importKey(
		"pkcs8",
		pemBytes(privateKey),
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		key,
		new TextEncoder().encode(`${header}.${payload}`),
	);
	return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}
async function installationToken(
	env: Pick<
		Env,
		"GITHUB_APP_ID" | "GITHUB_APP_INSTALLATION_ID" | "GITHUB_APP_PRIVATE_KEY"
	>,
	fetcher: Fetcher,
) {
	const context = {
		stage: "installation_token" as const,
		method: "POST" as const,
		endpoint: "/app/installations/[installation-id]/access_tokens",
	};
	let response: Response;
	try {
		response = await fetcher(
			`${api}/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
			{
				method: "POST",
				headers: {
					accept: "application/vnd.github+json",
					authorization: `Bearer ${await appJwt(env.GITHUB_APP_ID, env.GITHUB_APP_PRIVATE_KEY)}`,
					"x-github-api-version": "2022-11-28",
				},
			},
		);
	} catch (error) {
		throw new GitHubPublicationError("github_installation_token_failed", [
			networkFailure(error, context),
		]);
	}
	if (!response.ok)
		throw new GitHubPublicationError("github_installation_token_failed", [
			await responseFailure(response, context),
		]);
	return ((await response.json()) as { token: string }).token;
}
async function github(
	fetcher: Fetcher,
	token: string,
	path: string,
	init?: RequestInit,
) {
	return fetcher(`${api}${path}`, {
		...init,
		headers: {
			accept: "application/vnd.github+json",
			authorization: `Bearer ${token}`,
			"x-github-api-version": "2022-11-28",
			...init?.headers,
		},
	});
}
async function existingIssue(
	fetcher: Fetcher,
	token: string,
	marker: string,
	stage: "reconciliation_before_post" | "reconciliation_after_post",
) {
	const context = {
		stage,
		method: "GET" as const,
		endpoint: "/search/issues",
	};
	let response: Response;
	try {
		response = await github(
			fetcher,
			token,
			`/search/issues?q=${encodeURIComponent(`repo:${repository} in:body ${marker}`)}`,
		);
	} catch (error) {
		throw new GitHubPublicationError("github_reconciliation_unavailable", [
			networkFailure(error, context),
		]);
	}
	if (!response.ok)
		throw new GitHubPublicationError("github_reconciliation_unavailable", [
			await responseFailure(response, context),
		]);
	const result = (await response.json()) as {
		items: Array<{ number: number; html_url: string }>;
	};
	return result.items[0]
		? { number: result.items[0].number, url: result.items[0].html_url }
		: null;
}

export async function publishSupportIssue(
	env: Pick<
		Env,
		"GITHUB_APP_ID" | "GITHUB_APP_INSTALLATION_ID" | "GITHUB_APP_PRIVATE_KEY"
	>,
	reportId: string,
	issue: PublicIssue,
	fetcher: Fetcher = fetch,
) {
	const token = await installationToken(env, fetcher);
	const marker = `support-report:${reportId}`;
	const existing = await existingIssue(
		fetcher,
		token,
		marker,
		"reconciliation_before_post",
	);
	if (existing) return existing;
	let requestFailures: GitHubRequestFailure[] = [];
	try {
		const response = await github(
			fetcher,
			token,
			`/repos/${repository}/issues`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					title: issue.title,
					body: issueMarkdown(issue, reportId),
					labels: issue.labels,
				}),
			},
		);
		if (!response.ok)
			throw new GitHubPublicationError("github_issue_create_failed", [
				await responseFailure(response, {
					stage: "issue_creation",
					method: "POST",
					endpoint: `/repos/${repository}/issues`,
				}),
			]);
		const created = (await response.json()) as {
			number: number;
			html_url: string;
		};
		return { number: created.number, url: created.html_url };
	} catch (error) {
		requestFailures = githubRequestFailuresFromError(error);
		if (requestFailures.length === 0)
			requestFailures = [
				networkFailure(error, {
					stage: "issue_creation",
					method: "POST",
					endpoint: `/repos/${repository}/issues`,
				}),
			];
		// A timed-out POST may have succeeded. Reconcile once and never POST again.
		try {
			const reconciled = await existingIssue(
				fetcher,
				token,
				marker,
				"reconciliation_after_post",
			);
			if (reconciled) return { ...reconciled, requestFailures };
		} catch (reconciliationError) {
			requestFailures.push(
				...githubRequestFailuresFromError(reconciliationError),
			);
		}
		throw new GitHubPublicationError("github_post_ambiguous", requestFailures);
	}
}
