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

export function newInviteToken() {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function continuationCookie(value: string, maxAge = 600) {
	return `din-din-admin-invite=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/api/admin/invite; Max-Age=${maxAge}`;
}

export function readCookie(request: Request, name: string) {
	return request.headers
		.get("cookie")
		?.split(";")
		.map((part) => part.trim().split("=", 2))
		.find(([key]) => key === name)?.[1];
}

export function sameAdminOrigin(request: Request) {
	return request.headers.get("origin") === new URL(request.url).origin;
}
