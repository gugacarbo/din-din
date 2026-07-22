import { z } from "zod";
import {
	adminHmac,
	continuationCookie,
	newInviteToken,
	normalizeAdminEmail,
	readCookie,
} from "#/lib/admin-invite.ts";
import { createCoreAuth } from "#/lib/auth-core.ts";

const prepareSchema = z.object({
	token: z.string().min(32),
	email: z.string().email(),
});

export class InviteError extends Error {
	constructor(
		readonly status: 400 | 401 | 403 | 409,
		message: string,
	) {
		super(message);
	}
}

export async function prepareAdminInvite(
	d1: D1Database,
	input: unknown,
	appSecret: string,
) {
	const parsed = prepareSchema.safeParse(input);
	if (!parsed.success) throw new InviteError(400, "invalid_invite");
	const email = normalizeAdminEmail(parsed.data.email);
	const tokenHmac = await adminHmac(
		appSecret,
		"admin-invite:v1",
		parsed.data.token,
	);
	const invite = await d1
		.prepare(
			"select invite_id from admin_invites where token_hmac = ? and email_normalized = ? and consumed_at is null and expires_at > ?",
		)
		.bind(tokenHmac, email, Date.now())
		.first<{ invite_id: string }>();
	if (!invite) throw new InviteError(400, "invalid_invite");
	const nonce = newInviteToken();
	const continuationHmac = await adminHmac(
		appSecret,
		"admin-invite-continuation:v1",
		nonce,
	);
	const now = Date.now();
	await d1
		.prepare(
			"insert or replace into admin_invite_continuations (continuation_hmac, invite_id, nonce, expires_at, created_at) values (?, ?, ?, ?, ?)",
		)
		.bind(continuationHmac, invite.invite_id, "bound", now + 10 * 60_000, now)
		.run();
	return {
		headers: {
			"set-cookie": continuationCookie(nonce),
			"cache-control": "no-store",
			"referrer-policy": "no-referrer",
		},
	};
}

export async function concludeAdminInvite(
	d1: D1Database,
	request: Request,
	appSecret: string,
) {
	const nonce = readCookie(request, "din-din-admin-invite");
	const clear = continuationCookie("", 0);
	if (!nonce) throw new InviteError(400, "invalid_continuation");
	const continuationHmac = await adminHmac(
		appSecret,
		"admin-invite-continuation:v1",
		nonce,
	);
	const session = await createCoreAuth(d1).api.getSession({
		headers: request.headers,
	});
	if (!session?.user) throw new InviteError(401, "unauthenticated");
	if (!session.user.emailVerified)
		throw new InviteError(403, "email_not_verified");
	const continuation = await d1
		.prepare(
			"select c.invite_id, i.email_normalized from admin_invite_continuations c join admin_invites i on i.invite_id = c.invite_id where c.continuation_hmac = ? and c.expires_at > ? and i.consumed_at is null and i.expires_at > ?",
		)
		.bind(continuationHmac, Date.now(), Date.now())
		.first<{ invite_id: string; email_normalized: string }>();
	if (!continuation) throw new InviteError(400, "invalid_continuation");
	if (normalizeAdminEmail(session.user.email) !== continuation.email_normalized)
		throw new InviteError(403, "email_mismatch");
	const now = Date.now();
	const result = await d1.batch([
		d1
			.prepare(
				"update admin_invites set consumed_at = ?, consumed_by_user_id = ? where invite_id = ? and consumed_at is null and expires_at > ?",
			)
			.bind(now, session.user.id, continuation.invite_id, now),
		d1
			.prepare(
				"insert or ignore into admin_memberships (user_id, created_at, created_by_invite_id) select ?, ?, ? where exists(select 1 from admin_invites where invite_id = ? and consumed_by_user_id = ? and consumed_at = ?)",
			)
			.bind(
				session.user.id,
				now,
				continuation.invite_id,
				continuation.invite_id,
				session.user.id,
				now,
			),
		d1
			.prepare(
				"delete from admin_invite_continuations where continuation_hmac = ?",
			)
			.bind(continuationHmac),
	]);
	if (result[0].meta.changes !== 1)
		throw new InviteError(409, "invite_consumed");
	return {
		headers: {
			"set-cookie": clear,
			"cache-control": "no-store",
			"referrer-policy": "no-referrer",
		},
	};
}
