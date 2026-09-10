import { defineConfig } from "vitest/config";
import { coverageOptions } from "./vitest.coverage.ts";

/**
 * Vitest configuration for pure unit tests that do not require the Workers
 * runtime or D1 bindings. These tests run in the default Node.js environment.
 *
 * Path alias `#/*` mirrors the `imports` field in `package.json` and the
 * `paths` entry in `tsconfig.json`. Coverage measures modules deliberately
 * owned by these fast Node tests; Workers and UI suites cover the rest.
 */
export default defineConfig({
	resolve: {
		alias: {
			"#/": new URL("./src/", import.meta.url).pathname,
		},
	},
	test: {
		coverage: {
			...coverageOptions,
			reportsDirectory: "./coverage/unit",
			include: [
				"src/lib/finance.ts",
				"src/lib/support.ts",
				"src/server/ai-logging.ts",
				"src/server/github-support-publisher.ts",
				"src/server/support-issue-writer.ts",
				"src/server/support-publication-policy.ts",
			],
		},
		include: ["src/**/*.test.ts"],
		exclude: ["test/workers/**", "node_modules/**"],
	},
});
