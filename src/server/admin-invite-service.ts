import { z } from "zod";
import {
	adminHmac,
	adminInviteDigest,
	normalizeAdminEmail,
} from "#/lib/admin-invite.ts";
import { createCoreAuth } from "#/lib/auth-core.ts";

const acceptSchema = z.object({
	token: z.string().min(32),
});

export class InviteError extends Error {
	constructor(
		readonly status: 400 | 401 | 403 | 409,
		message: string,
	) {
		super(message);
	}
}

type AdminInvite = {
	invite_id: string;
	email_normalized: string | null;
	expires_at: number;
	consumed_at: number | null;
};

export async function acceptAdminInvite(
	d1: D1Database,
	request: Request,
	input: unknown,
	appSecret: string,
) {
	const parsed = acceptSchema.safeParse(input);
	if (!parsed.success) throw new InviteError(400, "invalid_invite");
	const session = await createCoreAuth(d1).api.getSession({
		headers: request.headers,
	});
	if (!session?.user) throw new InviteError(401, "unauthenticated");
	if (!session.user.emailVerified)
		throw new InviteError(403, "email_not_verified");
	const email = normalizeAdminEmail(session.user.email);
	const now = Date.now();
	const tokenDigest = await adminInviteDigest(parsed.data.token);
	let invite = await d1
		.prepare(
			"select invite_id, email_normalized, expires_at, consumed_at from admin_invites where token_digest = ?",
		)
		.bind(tokenDigest)
		.first<AdminInvite>();
	if (!invite) {
		const tokenHmac = await adminHmac(
			appSecret,
			"admin-invite:v1",
			parsed.data.token,
		);
		invite = await d1
			.prepare(
				"select invite_id, email_normalized, expires_at, consumed_at from admin_invites where token_hmac = ?",
			)
			.bind(tokenHmac)
			.first<AdminInvite>();
	}
	if (!invite) throw new InviteError(400, "invalid_invite");
	if (invite.consumed_at !== null)
		throw new InviteError(409, "invite_consumed");
	if (invite.expires_at <= now) throw new InviteError(400, "invalid_invite");
	if (invite.email_normalized && invite.email_normalized !== email)
		throw new InviteError(403, "email_mismatch");
	const result = await d1.batch([
		d1
			.prepare(
				"update admin_invites set email_normalized = coalesce(email_normalized, ?), consumed_at = ?, consumed_by_user_id = ? where invite_id = ? and consumed_at is null and expires_at > ? and (email_normalized is null or email_normalized = ?)",
			)
			.bind(email, now, session.user.id, invite.invite_id, now, email),
		d1
			.prepare(
				"insert or ignore into admin_memberships (user_id, created_at, created_by_invite_id) select ?, ?, ? where exists(select 1 from admin_invites where invite_id = ? and consumed_by_user_id = ? and consumed_at = ?)",
			)
			.bind(
				session.user.id,
				now,
				invite.invite_id,
				invite.invite_id,
				session.user.id,
				now,
			),
	]);
	if (result[0].meta.changes !== 1)
		throw new InviteError(409, "invite_consumed");
	return {
		headers: {
			"cache-control": "no-store",
			"referrer-policy": "no-referrer",
		},
	};
}
