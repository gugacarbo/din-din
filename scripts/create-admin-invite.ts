import { spawnSync } from "node:child_process";
import { adminHmac, newInviteToken } from "../src/lib/admin-invite.ts";

const [mode, origin] = process.argv.slice(2);
if ((mode !== "--local" && mode !== "--remote") || !origin) {
	throw new Error("Uso: pnpm admin:invite --local|--remote https://origem");
}
const parsedOrigin = new URL(origin);
if (parsedOrigin.protocol !== "https:" || parsedOrigin.pathname !== "/")
	throw new Error("A origem do convite precisa ser HTTPS sem caminho.");
const secret = process.env.APP_SECRET;
if (!secret || secret.length < 32) throw new Error("APP_SECRET ausente ou curto.");
const token = newInviteToken();
const inviteId = crypto.randomUUID();
const now = Date.now();
const tokenHmac = await adminHmac(secret, "admin-invite:v1", token);
const sql = `insert into admin_invites (invite_id, token_hmac, expires_at, created_at) values ('${inviteId}', '${tokenHmac}', ${now + 86_400_000}, ${now});`;
const result = spawnSync(
	"pnpm",
	["exec", "wrangler", "d1", "execute", "din-din", mode, "--command", sql],
	{ encoding: "utf8" },
);
if (result.status !== 0) throw new Error("Não foi possível criar o convite administrativo.");
console.log(`${parsedOrigin.origin}/admin/convite#${token}`);
