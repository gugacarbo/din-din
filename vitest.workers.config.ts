import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest configuration for tests that run in the Cloudflare Workers runtime
 * against an ephemeral, local D1 database. The `wrangler.jsonc` is reused for
 * bindings, but `remote: true` is never set: `env.DB` is a Miniflare-provided
 * local D1 instance, not the production database.
 *
 * Synthetic, non-secret values are provided for the four auth-related vars so
 * that `src/env.ts` and `createAuth()` can be imported inside the pool without
 * hitting real OAuth or production secrets.
 */
export default defineConfig(async () => {
	const migrationsPath = path.join(__dirname, "drizzle");
	const migrations = await readD1Migrations(migrationsPath);

	return {
		plugins: [
			cloudflareTest({
				main: "./test/workers/worker.ts",
				remoteBindings: false,
				wrangler: { configPath: "test/fixtures/wrangler-workers-test.jsonc" },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: migrations,
						BETTER_AUTH_SECRET:
							"test-secret-with-at-least-32-characters-for-better-auth",
						BETTER_AUTH_URL: "http://localhost:3000",
						GOOGLE_CLIENT_ID: "test-google-client-id",
						GOOGLE_CLIENT_SECRET: "test-google-client-secret",
						GITHUB_APP_ID: "123",
						GITHUB_APP_INSTALLATION_ID: "456",
						GITHUB_APP_PRIVATE_KEY: "test-private-key",
						APP_SECRET: "test-app-secret-with-at-least-32-characters",
					},
				},
			}),
		],
		test: {
			include: ["test/workers/**/*.test.ts"],
			exclude: ["src/**/*.test.ts", "node_modules/**"],
			setupFiles: ["./test/workers/setup.ts"],
			server: {
				deps: {
					external: ["@tanstack/react-start"],
				},
			},
		},
	};
});
