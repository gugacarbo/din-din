import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for pure unit tests that do not require the Workers
 * runtime or D1 bindings. These tests run in the default Node.js environment.
 *
 * Path alias `#/*` mirrors the `imports` field in `package.json` and the
 * `paths` entry in `tsconfig.json`.
 */
export default defineConfig({
	resolve: {
		alias: {
			"#/": new URL("./src/", import.meta.url).pathname,
		},
	},
	test: {
		include: ["src/**/*.test.ts"],
		exclude: ["test/workers/**", "node_modules/**"],
	},
});
