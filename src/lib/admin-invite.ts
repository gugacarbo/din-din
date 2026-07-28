const encoder = new TextEncoder();

function base64url(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

export function normalizeAdminEmail(email: string) {
	return email.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export async function adminHmac(secret: string, domain: string, value: string) {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return base64url(
		new Uint8Array(
			await crypto.subtle.sign(
				"HMAC",
				key,
				encoder.encode(`${domain}:${value}`),
			),
		),
	);
}

/**
 * New bearer invites are self-verifying random values, so their persisted form
 * does not need a Worker secret. Keep the domain prefix to prevent an
 * accidental reuse of the same digest format elsewhere.
 */
export async function adminInviteDigest(token: string) {
	return base64url(
		new Uint8Array(
			await crypto.subtle.digest(
				"SHA-256",
				encoder.encode(`admin-invite:v2:${token}`),
			),
		),
	);
}

export function newInviteToken() {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function sameAdminOrigin(request: Request) {
	return request.headers.get("origin") === new URL(request.url).origin;
}
