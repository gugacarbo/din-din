import { env as cloudflareEnv } from "cloudflare:workers";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const runtimeEnv = cloudflareEnv;

/** D1 is a Worker binding, not a primitive environment variable for T3 Env. */
export const database = runtimeEnv.DB;

/** Validated server-only bindings for the current Cloudflare Worker request. */
export const env = createEnv({
	server: {
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		GOOGLE_CLIENT_ID: z.string().min(1),
		GOOGLE_CLIENT_SECRET: z.string().min(1),
		GITHUB_APP_ID: z.string().min(1),
		GITHUB_APP_INSTALLATION_ID: z.string().min(1),
		GITHUB_APP_PRIVATE_KEY: z.string().min(1),
		APP_SECRET: z.string().min(32),
	},
	runtimeEnvStrict: {
		BETTER_AUTH_SECRET: runtimeEnv.BETTER_AUTH_SECRET,
		BETTER_AUTH_URL: runtimeEnv.BETTER_AUTH_URL,
		GOOGLE_CLIENT_ID: runtimeEnv.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: runtimeEnv.GOOGLE_CLIENT_SECRET,
		GITHUB_APP_ID: runtimeEnv.GITHUB_APP_ID,
		GITHUB_APP_INSTALLATION_ID: runtimeEnv.GITHUB_APP_INSTALLATION_ID,
		GITHUB_APP_PRIVATE_KEY: runtimeEnv.GITHUB_APP_PRIVATE_KEY,
		APP_SECRET: runtimeEnv.APP_SECRET,
	},
	emptyStringAsUndefined: true,
});
