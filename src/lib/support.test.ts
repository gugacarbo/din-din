import { describe, expect, it } from "vitest";
import { redactText, safeValue } from "#/lib/support.ts";

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
});
