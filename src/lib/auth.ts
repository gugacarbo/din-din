import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { createAuthOptions } from "#/lib/auth-core";

/** Creates an auth instance from the current Worker request's D1 binding. */
export function createAuth(d1?: D1Database) {
	const { plugins, ...options } = createAuthOptions(d1);
	return betterAuth({
		...options,
		plugins: [...plugins, tanstackStartCookies() as BetterAuthPlugin],
	});
}

/** Convenience factory for route handlers running in the Worker runtime. */
export function getAuth() {
	return createAuth();
}
