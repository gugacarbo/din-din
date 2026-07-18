import { env as cloudflareEnv } from "cloudflare:workers";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

type WorkerRuntimeEnv = {
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
};

const runtimeEnv = cloudflareEnv as unknown as WorkerRuntimeEnv & {
	DB?: D1Database;
};

if (!runtimeEnv.DB) {
	throw new Error("O binding D1 DB não está configurado para este Worker.");
}

/** D1 is a Worker binding, not a primitive environment variable for T3 Env. */
export const database = runtimeEnv.DB;

/** Validated server-only bindings for the current Cloudflare Worker request. */
export const env = createEnv({
	server: {
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		GOOGLE_CLIENT_ID: z.string().min(1),
		GOOGLE_CLIENT_SECRET: z.string().min(1),
	},
	runtimeEnvStrict: {
		BETTER_AUTH_SECRET: runtimeEnv.BETTER_AUTH_SECRET,
		BETTER_AUTH_URL: runtimeEnv.BETTER_AUTH_URL,
		GOOGLE_CLIENT_ID: runtimeEnv.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: runtimeEnv.GOOGLE_CLIENT_SECRET,
	},
	emptyStringAsUndefined: true,
});

export type RuntimeEnv = typeof env;
