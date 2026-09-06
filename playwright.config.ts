import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./test/e2e",
	testMatch: /payment-option\.local\.e2e\.test\.ts/,
	fullyParallel: false,
	use: {
		baseURL: "http://localhost:3000",
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "pnpm run db:migrate:local && pnpm run dev",
		url: "http://localhost:3000/login",
		reuseExistingServer: true,
		timeout: 120_000,
	},
});
