/**
 * Shared coverage defaults. Unit coverage is the enforceable baseline; UI
 * reports remain informational because jsdom cannot cover the full graph.
 */
export const coverageOptions = {
	provider: "v8" as const,
	reporter: ["text", "html"],
	thresholds: {
		branches: 78,
		functions: 90,
		lines: 83,
		statements: 82,
	},
};
