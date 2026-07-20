import { env } from "cloudflare:workers";
import { makeSignature } from "better-auth/crypto";

import { createCoreAuth } from "#/lib/auth-core";

/**
 * Test fixtures for the Workers Vitest pool.
 *
 * Each fixture creates a real Better Auth user + session in the ephemeral D1
 * and returns the `Cookie` header that `createAuth(env.DB).api.getSession()`
 * accepts. No `userId` is ever passed to the finance service: the service
 * resolves the session from the cookie via Better Auth, exactly as in
 * production.
 *
 * Users and sessions are inserted directly via D1 SQL because the production
 * `createAuth` configuration only enables Google OAuth (no
 * `emailAndPassword`). The session cookie is then validated through the real
 * `createAuth(env.DB).api.getSession()` before being handed to the finance
 * service, proving that the adapter exercises the same Better Auth resolution
 * path used in production.
 */

export type AuthedUser = {
	id: string;
	email: string;
	cookieHeader: string;
};

const SESSION_COOKIE_NAME = "__Secure-better-auth.session_token";
const TEST_AUTH_SECRET =
	"test-secret-with-at-least-32-characters-for-better-auth";

function randomId() {
	return crypto.randomUUID();
}

function nowMs() {
	return Date.now();
}

function plusDays(days: number) {
	return Date.now() + days * 24 * 60 * 60 * 1000;
}

async function insertUser(
	d1: D1Database,
	email: string,
	name: string,
): Promise<{ id: string; cookieHeader: string }> {
	const userId = randomId();
	const timestamp = nowMs();
	await d1
		.prepare(
			"insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
		)
		.bind(userId, name, email, 1, timestamp, timestamp)
		.run();

	const sessionId = randomId();
	const token = randomId();
	const expiresAt = plusDays(7);
	await d1
		.prepare(
			"insert into session (id, expires_at, token, user_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
		)
		.bind(sessionId, expiresAt, token, userId, timestamp, timestamp)
		.run();

	const signature = await makeSignature(token, TEST_AUTH_SECRET);
	const signedToken = `${token}.${signature}`;
	// The production URL is HTTPS, while local test overrides may be HTTP.
	// Providing both official Better Auth cookie forms lets the same fixture
	// validate whichever secure-cookie setting the Worker config resolves to.
	const cookieHeader = `${SESSION_COOKIE_NAME}=${signedToken}; better-auth.session_token=${signedToken}`;
	return { id: userId, cookieHeader };
}

/**
 * Validates the given cookie through the real Better Auth `getSession` API
 * against the ephemeral D1, returning the resolved user id. Throws if the
 * session is invalid.
 */
export async function resolveSession(
	d1: D1Database,
	cookieHeader: string,
): Promise<string> {
	const auth = createCoreAuth(d1);
	const session = await auth.api.getSession({
		headers: new Headers({ cookie: cookieHeader }),
	});
	if (!session?.user) {
		throw new Error("Fixture session was not accepted by Better Auth");
	}
	return session.user.id;
}

/**
 * Creates two authenticated users (A and B) in the ephemeral D1 and returns
 * their Cookie headers. The cookies are validated through the real Better Auth
 * `getSession` API before being handed to the finance service.
 */
export async function createAuthedPair(): Promise<{
	a: AuthedUser;
	b: AuthedUser;
}> {
	const suffix = crypto.randomUUID();
	const a = await insertUser(env.DB, `user-a-${suffix}@example.com`, "User A");
	const b = await insertUser(env.DB, `user-b-${suffix}@example.com`, "User B");
	// Validate both sessions through the real Better Auth path.
	await resolveSession(env.DB, a.cookieHeader);
	await resolveSession(env.DB, b.cookieHeader);
	return {
		a: { id: a.id, email: `user-a-${suffix}@example.com`, cookieHeader: a.cookieHeader },
		b: { id: b.id, email: `user-b-${suffix}@example.com`, cookieHeader: b.cookieHeader },
	};
}

/**
 * Builds a `Headers` object carrying the given cookie, suitable for passing to
 * `createFinanceService({ d1, headers })`.
 */
export function headersWithCookie(cookieHeader: string): Headers {
	return new Headers({ cookie: cookieHeader });
}
