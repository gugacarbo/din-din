import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { navigationCacheName } from "./src/lib/pwa.ts";

const isTest = process.env.VITEST === "true";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		...(isTest ? [] : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		...(isTest
			? []
			: [
					VitePWA({
						injectRegister: false,
						manifestFilename: "manifest.webmanifest",
						registerType: "prompt",
						manifest: {
							name: "Din Din",
							short_name: "Din Din",
							description: "Finanças pessoais claras.",
							lang: "pt-BR",
							start_url: "/",
							display: "standalone",
							theme_color: "#4fb8b2",
							background_color: "#e7f3ec",
							icons: [
								{ src: "/logo192.png", sizes: "192x192", type: "image/png" },
								{ src: "/logo512.png", sizes: "512x512", type: "image/png" },
							],
						},
						workbox: {
							cleanupOutdatedCaches: true,
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
						},
					}),
				]),
	],
});

export default config;
