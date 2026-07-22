import { describe, expect, it } from "vitest";
import {
	maxDiagnosticsBytes,
	redactText,
	safeValue,
	serialiseDiagnostics,
} from "#/lib/support.ts";

describe("support privacy helpers", () => {
	it("redacts secret-shaped values and query strings", () => {
		expect(
			redactText(
				"Bearer ghp_abcdefghijklmnopqrstuvwxyz123456 https://example.test/path?token=private",
			),
		).not.toContain("ghp_");
		expect(redactText("https://example.test/path?token=private")).not.toContain(
			"private",
		);
	});
	it("limits circular console objects and redacts sensitive keys", () => {
		const value: { token: string; nested?: unknown } = { token: "private" };
		value.nested = value;
		expect(safeValue(value)).toEqual({
			token: "[redacted]",
			nested: "[circular]",
		});
	});
	it("redacts credential values in textual console arguments", () => {
		for (const [input, secret] of [
			[
				"Cookie: session=super-secret-cookie-value",
				"super-secret-cookie-value",
			],
			["Authorization: Basic dXNlcjpwYXNz", "dXNlcjpwYXNz"],
			["Authorization: Bearer super-secret-token", "super-secret-token"],
			["password=super-secret", "super-secret"],
		])
			expect(redactText(input)).not.toContain(secret);
		expect(safeValue("password=super-secret")).toBe("password=[redacted]");
	});
	it("keeps recent sanitized diagnostics within the aggregate byte budget", () => {
		const serialized = serialiseDiagnostics({
			console: Array.from({ length: 50 }, (_, at) => ({
				at,
				level: "error" as const,
				args: Array.from({ length: 20 }, () => "x".repeat(500)),
			})),
			requests: [],
			route: "/transactions",
			viewport: { width: 1280, height: 800 },
			online: true,
			browser: "test",
		});
		expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
			maxDiagnosticsBytes,
		);
		const diagnostics = JSON.parse(serialized) as {
			console: Array<{ at: number }>;
		};
		expect(diagnostics.console.at(-1)?.at).toBe(49);
	});
});
