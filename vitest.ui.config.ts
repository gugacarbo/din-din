import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { coverageOptions } from "./vitest.coverage.ts";

export default defineConfig({
	plugins: [viteReact()],
	resolve: {
		alias: {
			"#/": new URL("./src/", import.meta.url).pathname,
			"cloudflare:workers": new URL(
				"./test/ui/cloudflare-workers-stub.ts",
				import.meta.url,
			).pathname,
		},
	},
	test: {
		coverage: {
			...coverageOptions,
			reportsDirectory: "./coverage/ui",
			// UI coverage is informational for now: jsdom suites cannot exercise the
			// full shipped component graph without duplicating browser E2E flows.
			thresholds: {},
		},
		environment: "jsdom",
		include: ["test/ui/**/*.test.tsx"],
		setupFiles: ["./test/ui/setup.ts"],
	},
});
