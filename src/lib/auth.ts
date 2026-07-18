import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { createDb } from "#/db";
import * as schema from "#/db/schema";
import { database, env } from "#/env";

/** Creates an auth instance from the current Worker request's D1 binding. */
export function createAuth(d1 = database) {
	return betterAuth({
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(createDb(d1), {
			provider: "sqlite",
			schema,
		}),
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
			},
		},
		plugins: [tanstackStartCookies()],
	});
}

/** Convenience factory for route handlers running in the Worker runtime. */
export function getAuth() {
	return createAuth();
}
