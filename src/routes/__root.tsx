import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	ScriptOnce,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { PwaRegistration } from "#/components/pwa-registration.tsx";
import { installSupportDiagnostics } from "#/lib/support-diagnostics.ts";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

const themeScript = `(() => {
	try {
		const saved = window.localStorage.getItem("din-din-theme");
		const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
		const dark = saved === "dark" || (saved !== "light" && prefersDark);
		document.documentElement.classList.toggle("dark", dark);
	} catch {}
})();`;

const inviteFragmentScript = `(() => {
	if (location.pathname !== "/admin/convite" || !location.hash) return;
	const token = location.hash.slice(1);
	if (!token) return;
	window.__DIN_DIN_ADMIN_INVITE_TOKEN = token;
	history.replaceState(null, "", location.pathname + location.search);
})();`;

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				name: "theme-color",
				content: "#4fb8b2",
			},
			{
				name: "apple-mobile-web-app-capable",
				content: "yes",
			},
			{
				name: "apple-mobile-web-app-status-bar-style",
				content: "default",
			},
			{
				name: "apple-mobile-web-app-title",
				content: "Din Din",
			},
			{
				title: "Din Din · finanças pessoais",
			},
		],
		links: [
			{
				rel: "icon",
				type: "image/png",
				href: "/favicon-96x96.png",
				sizes: "96x96",
			},
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/favicon.svg",
			},
			{
				rel: "shortcut icon",
				href: "/favicon.ico",
			},
			{
				rel: "apple-touch-icon",
				href: "/apple-touch-icon.png",
				sizes: "180x180",
			},
			{
				rel: "manifest",
				href: "/site.webmanifest",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="pt-BR" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ScriptOnce>{themeScript}</ScriptOnce>
				<ScriptOnce>{inviteFragmentScript}</ScriptOnce>
				<SupportDiagnosticsBootstrap />
				{children}
				<PwaRegistration />
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}

function SupportDiagnosticsBootstrap() {
	if (typeof window !== "undefined") installSupportDiagnostics();
	return null;
}
