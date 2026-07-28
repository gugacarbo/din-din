import { spawnSync } from "node:child_process";

const env = { ...process.env };
for (const name of [
	"CLOUDFLARE_API_TOKEN",
	"CLOUDFLARE_API_KEY",
	"CLOUDFLARE_EMAIL",
	"CF_API_TOKEN",
	"CF_API_KEY",
	"CF_EMAIL",
])
	delete env[name];

const wrangler = [
	process.execPath,
	"./node_modules/wrangler/bin/wrangler.js",
	"whoami",
];
const authenticated = spawnSync(wrangler[0], wrangler.slice(1), {
	cwd: process.cwd(),
	env,
	stdio: "ignore",
});

if (authenticated.status !== 0) {
	console.error(
		"Workers AI E2E requires a Wrangler OAuth session. Run `pnpm exec wrangler login`; this suite intentionally does not use CLOUDFLARE_API_TOKEN.",
	);
	process.exit(1);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const test = spawnSync(
	pnpm,
	["exec", "vitest", "run", "--config", "vitest.ai-e2e.config.ts"],
	{ cwd: process.cwd(), env, stdio: "inherit" },
);

process.exit(test.status ?? 1);
