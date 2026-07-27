import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isTest = process.env.VITEST === "true";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	build: {
		rolldownOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes("node_modules")) return;
					if (
						[
							"/recharts/",
							"/react-redux/",
							"/@reduxjs/",
							"/reselect/",
							"/immer/",
							"/es-toolkit/",
							"/decimal.js-light/",
							"/eventemitter3/",
							"/use-sync-external-store/",
							"/tiny-invariant/",
						].some((packagePath) => id.includes(packagePath))
					)
						return "reports-data";
					if (id.includes("/victory-vendor/")) return "reports-victory";
					if (id.includes("@base-ui/react")) return "base-ui";
					if (id.includes("@tanstack/")) return "tanstack";
					if (id.includes("react-dom") || id.includes("/react/"))
						return "react";
				},
			},
		},
	},
	plugins: [
		devtools(),
		...(isTest ? [] : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
