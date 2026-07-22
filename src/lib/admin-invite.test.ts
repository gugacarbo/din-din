import { describe, expect, it } from "vitest";
import { adminHmac, normalizeAdminEmail } from "#/lib/admin-invite.ts";

describe("admin invite primitives", () => {
	it("normalizes e-mail and derives a scoped, deterministic HMAC", async () => {
		expect(normalizeAdminEmail("  ADMIN@Exemplo.Test ")).toBe(
			"admin@exemplo.test",
		);
		await expect(adminHmac("a".repeat(32), "one", "token")).resolves.not.toBe(
			await adminHmac("a".repeat(32), "two", "token"),
		);
	});
});
