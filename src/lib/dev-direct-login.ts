import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

const directLoginBody = z.object({
	email: z.string().trim().toLowerCase().email(),
});

/**
 * Local-only authentication endpoint used to work with a known account without
 * going through Google OAuth. It is registered exclusively by development
 * builds in `createAuthOptions`.
 */
export function devDirectLogin() {
	return {
		id: "dev-direct-login",
		endpoints: {
			directLogin: createAuthEndpoint(
				"/dev-login",
				{
					method: "POST",
					requireHeaders: true,
					body: directLoginBody,
				},
				async (ctx) => {
					const { email } = ctx.body;
					let user = await ctx.context.internalAdapter
						.findUserByEmail(email)
						.then((result) => result?.user);

					if (!user) {
						user = await ctx.context.internalAdapter.createUser({
							email,
							emailVerified: true,
							name: email.slice(0, email.indexOf("@")),
						});
					}
					if (!user) throw new Error("Não foi possível criar o usuário local.");

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
					);
					if (!session)
						throw new Error("Não foi possível criar a sessão local.");

					await setSessionCookie(ctx, { session, user });
					return ctx.json({ user: { email: user.email } });
				},
			),
		},
	};
}
