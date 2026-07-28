import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * This suite intentionally proxies `env.AI` to Workers AI. It is opt-in and
 * never included in `pnpm test`, so local/CI tests remain offline and free.
 */
export default defineConfig({
	plugins: [
		cloudflareTest({
			main: "./test/e2e/worker.ts",
			remoteBindings: true,
			wrangler: {
				configPath: "test/fixtures/wrangler-ai-e2e-test.jsonc",
			},
		}),
	],
	test: {
		include: ["test/e2e/**/*.test.ts"],
		testTimeout: 60_000,
	},
});
