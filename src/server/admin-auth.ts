import { sameAdminOrigin } from "#/lib/admin-invite.ts";
import { createCoreAuth } from "#/lib/auth-core.ts";

export class AdminAuthError extends Error {
	constructor(readonly status: 401 | 403) {
		super(status === 401 ? "unauthenticated" : "forbidden");
	}
}

export async function requireAdmin(d1: D1Database, headers: Headers) {
	const session = await createCoreAuth(d1).api.getSession({ headers });
	if (!session?.user) throw new AdminAuthError(401);
	const membership = await d1
		.prepare("select user_id from admin_memberships where user_id = ?")
		.bind(session.user.id)
		.first();
	if (!membership) throw new AdminAuthError(403);
	return session.user;
}

export function sameOrigin(request: Request) {
	return sameAdminOrigin(request);
}

export const noStore = { "cache-control": "no-store" };
