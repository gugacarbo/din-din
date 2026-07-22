import { describe, expect, it } from "vitest";
import {
	adminHmac,
	continuationCookie,
	normalizeAdminEmail,
	sameAdminOrigin,
} from "#/lib/admin-invite.ts";

describe("admin invite primitives", () => {
	it("normalizes e-mail and derives a scoped, deterministic HMAC", async () => {
		expect(normalizeAdminEmail("  ADMIN@Exemplo.Test ")).toBe(
			"admin@exemplo.test",
		);
		await expect(adminHmac("a".repeat(32), "one", "token")).resolves.not.toBe(
			await adminHmac("a".repeat(32), "two", "token"),
		);
	});
	it("scopes the continuation cookie to both invite API endpoints and requires Origin", () => {
		expect(continuationCookie("opaque")).toContain("Path=/api/admin/invite");
		expect(
			sameAdminOrigin(
				new Request("https://app.test/api/admin/invite/conclude", {
					method: "POST",
				}),
			),
		).toBe(false);
		expect(
			sameAdminOrigin(
				new Request("https://app.test/api/admin/invite/conclude", {
					method: "POST",
					headers: { origin: "https://app.test" },
				}),
			),
		).toBe(true);
	});
});
