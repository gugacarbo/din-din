import { resolve } from "node:path";
import { generateSW } from "workbox-build";

import { navigationCacheName } from "../src/lib/pwa.ts";

const clientDirectory = resolve("dist/client");

const { warnings } = await generateSW({
	globDirectory: clientDirectory,
	globPatterns: [
		"assets/**/*.{js,css,woff,woff2}",
		"*.{ico,png,svg,webmanifest}",
	],
	globIgnores: ["sw.js", "workbox-*.js"],
	swDest: resolve(clientDirectory, "sw.js"),
	cleanupOutdatedCaches: true,
	navigateFallback: null,
	runtimeCaching: [
		{
			urlPattern: ({ request, url }) =>
				request.mode === "navigate" &&
				url.origin === self.location.origin &&
				url.pathname !== "/login",
			handler: "NetworkFirst",
			options: {
				cacheName: navigationCacheName,
				networkTimeoutSeconds: 3,
				expiration: {
					maxEntries: 7,
					maxAgeSeconds: 60 * 60 * 24 * 30,
				},
				cacheableResponse: { statuses: [200] },
			},
		},
	],
});

if (warnings.length) {
	throw new Error(warnings.join("\n"));
}
