import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type WebManifest = {
	name?: string;
	start_url?: string;
	icons?: Array<{ src?: string; sizes?: string; type?: string }>;
};

describe("site.webmanifest", () => {
	it("references the single checked-in manifest and existing icons", async () => {
		const root = resolve(import.meta.dirname, "../..");
		const manifest = JSON.parse(
			await readFile(resolve(root, "public/site.webmanifest"), "utf8"),
		) as WebManifest;

		expect(manifest.name).toBe("Din Din");
		expect(manifest.start_url).toBe("/");
		expect(manifest.icons).toHaveLength(2);

		for (const icon of manifest.icons ?? []) {
			expect(icon.src).toMatch(/^\/.+\.png$/);
			expect(icon.sizes).toMatch(/^\d+x\d+$/);
			expect(icon.type).toBe("image/png");
			await expect(
				access(resolve(root, "public", icon.src?.slice(1) ?? "")),
			).resolves.toBeUndefined();
		}
	});
});
