import { env } from "cloudflare:workers";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { createDb } from "#/db";
import * as schema from "#/db/schema";

type AuthEnv = {
	DB: D1Database;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL?: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
};

/** Creates an auth instance from the current Worker request's D1 binding. */
export function createAuth(database: D1Database) {
	const runtime = env as unknown as AuthEnv;

	return betterAuth({
		baseURL: runtime.BETTER_AUTH_URL,
		secret: runtime.BETTER_AUTH_SECRET,
		database: drizzleAdapter(createDb(database), {
			provider: "sqlite",
			schema,
		}),
		socialProviders: {
			google: {
				clientId: runtime.GOOGLE_CLIENT_ID,
				clientSecret: runtime.GOOGLE_CLIENT_SECRET,
			},
		},
		plugins: [tanstackStartCookies()],
	});
}

/** Convenience factory for route handlers running in the Worker runtime. */
export function getAuth() {
	return createAuth((env as unknown as AuthEnv).DB);
}
