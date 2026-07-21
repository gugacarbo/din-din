import { google } from "better-auth/social-providers";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createAuthOptions } from "#/lib/auth-core";

function googleIdToken(payload: Record<string, unknown>) {
	const header = { alg: "none", typ: "JWT" };
	const encode = (value: Record<string, unknown>) =>
		btoa(JSON.stringify(value))
			.replaceAll("+", "-")
			.replaceAll("/", "_")
			.replaceAll("=", "");
	return `${encode(header)}.${encode(payload)}.signature`;
}

describe("perfil do Google", () => {
	it("persiste e sincroniza a foto informada pelo Google no login", async () => {
		const options = createAuthOptions(env.DB);
		const provider = google(options.socialProviders.google);
		const image = "https://lh3.googleusercontent.com/a/profile-photo";

		const profile = await provider.getUserInfo({
			accessToken: "unused-in-id-token-flow",
			idToken: googleIdToken({
				email: "ana@example.com",
				email_verified: true,
				name: "Ana Silva",
				picture: image,
				sub: "google-user-1",
			}),
		});

		expect(profile?.user.image).toBe(image);
		expect(provider.options.overrideUserInfoOnSignIn).toBe(true);
	});
});
