import { describe, expect, it } from "vitest";
import {
	adminHmac,
	adminInviteDigest,
	newInviteToken,
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
		expect(
			sameAdminOrigin(
				new Request("https://app.test/api/admin/invite/accept", {
					method: "POST",
					headers: { origin: "https://evil.test" },
				}),
			),
		).toBe(false);
	});
	it("applies NFKC normalization and casing to admin e-mails", () => {
		expect(normalizeAdminEmail("ﬁle@Exemplo.Test")).toBe("file@exemplo.test");
		expect(normalizeAdminEmail("　Admin@Example.COM ")).toBe(
			"admin@example.com",
		);
		expect(normalizeAdminEmail("A@B.co")).toBe("a@b.co");
	});
	it("generates unique, unpadded base64url invite tokens", () => {
		const a = newInviteToken();
		const b = newInviteToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(a).not.toMatch(/[+=/]/);
		expect(a.length).toBe(43); // 32 random bytes, base64url without padding
		expect(a).not.toBe(b);
	});
	it("scopes the invite digest to a stable base64url hash", async () => {
		const digest = await adminInviteDigest("token");
		expect(digest).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(digest.length).toBe(43); // SHA-256, base64url without padding
		await expect(adminInviteDigest("other")).resolves.not.toBe(digest);
	});
});
