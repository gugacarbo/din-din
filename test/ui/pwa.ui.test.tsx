import { afterEach, describe, expect, it, vi } from "vitest";

import {
	clearNavigationCache,
	navigationCacheName,
} from "#/lib/pwa.ts";

describe("PWA cache", () => {
	afterEach(() => {
		Reflect.deleteProperty(window, "caches");
	});

	it("clears the authenticated navigation cache on logout", async () => {
		const deleteCache = vi.fn().mockResolvedValue(true);
		Object.defineProperty(window, "caches", {
			configurable: true,
			value: { delete: deleteCache },
		});

		await clearNavigationCache();

		expect(deleteCache).toHaveBeenCalledWith(navigationCacheName);
	});
});
