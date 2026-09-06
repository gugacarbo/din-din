export const coverageOptions = {
	provider: "v8" as const,
	reporter: ["text", "html"],
	thresholds: {
		branches: 90,
		functions: 90,
		lines: 90,
		statements: 90,
	},
};
