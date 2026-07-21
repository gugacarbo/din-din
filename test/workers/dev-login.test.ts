import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createCoreAuth } from "#/lib/auth-core";

const email = "local@example.com";

function directLoginRequest() {
	return new Request("http://localhost:3000/api/auth/dev-login", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email }),
	});
}

describe("development direct login", () => {
	it("creates or reuses the requested account and returns a valid session", async () => {
		const auth = createCoreAuth(env.DB);
		const firstResponse = await auth.handler(directLoginRequest());
		expect(firstResponse.status).toBe(200);
		const cookie = firstResponse.headers.get("set-cookie")?.split(";")[0];
		if (!cookie) throw new Error("A sessão de desenvolvimento não definiu cookie.");

		const session = await auth.api.getSession({
			headers: new Headers({ cookie }),
		});
		expect(session?.user.email).toBe(email);

		const secondResponse = await auth.handler(directLoginRequest());
		expect(secondResponse.status).toBe(200);
		const users = await env.DB
			.prepare("select count(*) as count from user where email = ?")
			.bind(email)
			.first<{ count: number }>();
		expect(users?.count).toBe(1);
	});
});
