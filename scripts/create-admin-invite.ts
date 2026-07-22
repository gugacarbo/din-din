import { spawnSync } from "node:child_process";
import { z } from "zod";
import { adminHmac, newInviteToken, normalizeAdminEmail } from "../src/lib/admin-invite.ts";

const [email, mode, origin] = process.argv.slice(2);
if (!email || (mode !== "--local" && mode !== "--remote") || !origin) {
	throw new Error("Uso: pnpm tsx scripts/create-admin-invite.ts email --local|--remote https://origem");
}
const parsedOrigin = new URL(origin);
if (parsedOrigin.protocol !== "https:" || parsedOrigin.pathname !== "/")
	throw new Error("A origem do convite precisa ser HTTPS sem caminho.");
const secret = process.env.APP_SECRET;
if (!secret || secret.length < 32) throw new Error("APP_SECRET ausente ou curto.");
const parsedEmail = z.string().trim().email().safeParse(email);
if (!parsedEmail.success) throw new Error("E-mail de convite inválido.");
const token = newInviteToken();
const inviteId = crypto.randomUUID();
const now = Date.now();
const tokenHmac = await adminHmac(secret, "admin-invite:v1", token);
const normalized = normalizeAdminEmail(parsedEmail.data);
const sql = `insert into admin_invites (invite_id, token_hmac, email_normalized, expires_at, created_at) values ('${inviteId}', '${tokenHmac}', '${normalized}', ${now + 86_400_000}, ${now});`;
const result = spawnSync(
	"pnpm",
	["exec", "wrangler", "d1", "execute", "din-din", mode, "--command", sql],
	{ encoding: "utf8" },
);
if (result.status !== 0) throw new Error("Não foi possível criar o convite administrativo.");
console.log(`${parsedOrigin.origin}/admin/convite#${token}`);
