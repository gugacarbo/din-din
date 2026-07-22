import { describe, expect, it } from "vitest";
import {
	maxDiagnosticsBytes,
	metadataFromDiagnostics,
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
	it("fails closed for nested and cyclic form values", () => {
		const form: {
			email: string;
			card: string;
			comment: string;
			self?: unknown;
		} = {
			email: "alice@example.test",
			card: "4111111111111111",
			comment: "free form value",
		};
		form.self = form;
		expect(safeValue({ form, self: form })).toBe("[redacted]");
		const serialized = serialiseDiagnostics({
			console: [{ at: 1, level: "error", args: [form] }],
			requests: [
				{
					at: 2,
					method: "POST",
					path: "/transactions?form=private#fragment",
					durationMs: 1,
					result: "success",
				},
			],
			route: "/transactions?token=private#fragment",
			viewport: { width: 1280, height: 800 },
			online: true,
			browser: "browser free form value",
		});
		for (const value of [
			"alice@example.test",
			"4111111111111111",
			"free form value",
			"private",
			"fragment",
		])
			expect(serialized).not.toContain(value);
		expect(metadataFromDiagnostics(serialized)).toBe(
			'{"route":"/transactions","viewport":{"width":1280,"height":800},"online":true}',
		);
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
		expect(safeValue("password=super-secret")).toBe("[redacted]");
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
