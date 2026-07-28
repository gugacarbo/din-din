import { describe, expect, it } from "vitest";
import {
	adminHmac,
	adminInviteDigest,
	normalizeAdminEmail,
	sameAdminOrigin,
} from "#/lib/admin-invite.ts";

describe("admin invite primitives", () => {
	it("normalizes e-mail and derives scoped, deterministic token forms", async () => {
		expect(normalizeAdminEmail("  ADMIN@Exemplo.Test ")).toBe(
			"admin@exemplo.test",
		);
		await expect(adminHmac("a".repeat(32), "one", "token")).resolves.not.toBe(
			await adminHmac("a".repeat(32), "two", "token"),
		);
		await expect(adminInviteDigest("token")).resolves.toBe(
			await adminInviteDigest("token"),
		);
	});
	it("requires Origin for accepting an invite", () => {
		expect(
			sameAdminOrigin(
				new Request("https://app.test/api/admin/invite/accept", {
					method: "POST",
				}),
			),
		).toBe(false);
		expect(
			sameAdminOrigin(
				new Request("https://app.test/api/admin/invite/accept", {
					method: "POST",
					headers: { origin: "https://app.test" },
				}),
			),
		).toBe(true);
	});
});
