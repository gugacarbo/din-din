import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { createDb } from "#/db";
import * as schema from "#/db/schema";
import { database, env } from "#/env";
import { devDirectLogin } from "#/lib/dev-direct-login";

const isDevelopment = import.meta.env.DEV;

/**
 * Creates the Better Auth core used to resolve a request session from D1.
 *
 * This module deliberately has no TanStack Start dependency so it can run in
 * the Workers Vitest pool. Route handlers add their framework cookie plugin in
 * `auth.ts`; financial authorization only needs Better Auth's core API.
 */
export function createAuthOptions(d1: D1Database = database) {
	return {
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
				// Persist Google's `picture` in `user.image` for new users and refresh
				// it whenever an existing user signs in again.
				overrideUserInfoOnSignIn: true,
			},
		},
		plugins: isDevelopment ? [devDirectLogin()] : [],
	};
}

export function createCoreAuth(d1: D1Database = database) {
	return betterAuth(createAuthOptions(d1));
}
