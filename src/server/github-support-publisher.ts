import {
	issueMarkdown,
	type PublicIssue,
} from "#/server/support-publication-policy.ts";

const repository = "gugacarbo/din-din";
const api = "https://api.github.com";
type Fetcher = typeof fetch;
function base64url(value: Uint8Array | string) {
	const text =
		typeof value === "string" ? value : String.fromCharCode(...value);
	return btoa(text)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}
function pemBytes(pem: string) {
	const body = pem
		.replaceAll("\\n", "\n")
		.replace(/-----[^-]+-----/g, "")
		.replace(/\s/g, "");
	const binary = atob(body);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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
	const response = await fetcher(
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
	if (!response.ok) throw new Error("github_installation_token_failed");
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
async function existingIssue(fetcher: Fetcher, token: string, marker: string) {
	const response = await github(
		fetcher,
		token,
		`/search/issues?q=${encodeURIComponent(`repo:${repository} in:body ${marker}`)}`,
	);
	if (!response.ok) throw new Error("github_reconciliation_unavailable");
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
	const existing = await existingIssue(fetcher, token, marker);
	if (existing) return existing;
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
		if (!response.ok) throw new Error("github_issue_create_failed");
		const created = (await response.json()) as {
			number: number;
			html_url: string;
		};
		return { number: created.number, url: created.html_url };
	} catch {
		// A timed-out POST may have succeeded. Reconcile once and never POST again.
		const reconciled = await existingIssue(fetcher, token, marker);
		if (reconciled) return reconciled;
		throw new Error("github_post_ambiguous");
	}
}
