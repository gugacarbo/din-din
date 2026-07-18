import { Link, useRouterState } from "@tanstack/react-router";
import {
	ArchiveRestore,
	BarChart3,
	LayoutDashboard,
	List,
	LogOut,
	Tags,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

import { ThemeToggle } from "./theme-toggle.tsx";

const primaryNavigation = [
	{ to: "/" as const, label: "Dashboard", icon: LayoutDashboard },
	{ to: "/transactions" as const, label: "Histórico", icon: List },
	{ to: "/reports" as const, label: "Relatórios", icon: BarChart3 },
];

const secondaryNavigation = [
	{ to: "/categories" as const, label: "Categorias", icon: Tags },
	{ to: "/archive" as const, label: "Arquivo", icon: ArchiveRestore },
];

function NavigationLink({
	item,
	compact = false,
}: {
	item:
		| (typeof primaryNavigation)[number]
		| (typeof secondaryNavigation)[number];
	compact?: boolean;
}) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const active = pathname === item.to;
	const Icon = item.icon;

	return (
		<a
			className={cn(
				"flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
				active
					? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
					: "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
				compact && "flex-col gap-1 px-2 py-1 text-[0.65rem]",
			)}
			href={item.to}
		>
			<Icon className="size-5" />
			<span>{item.label}</span>
		</a>
	);
}

export function AppShell({
	children,
	onLogout,
}: {
	children: ReactNode;
	onLogout: () => void;
}) {
	return (
		<div className="min-h-dvh pb-18 lg:pb-0">
			<aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-sidebar-border bg-sidebar/90 px-4 py-6 text-sidebar-foreground backdrop-blur lg:flex lg:flex-col">
				<Link className="mb-9 px-2" to="/">
					<p className="display-title text-3xl font-bold text-foreground">
						din din
					</p>
					<p className="island-kicker mt-1">suas finanças, claras</p>
				</Link>
				<nav className="space-y-1" aria-label="Principal">
					{primaryNavigation.map((item) => (
						<NavigationLink item={item} key={item.to} />
					))}
				</nav>
				<div className="mt-7 border-t border-sidebar-border pt-5">
					<nav className="space-y-1" aria-label="Secundária">
						{secondaryNavigation.map((item) => (
							<NavigationLink item={item} key={item.to} />
						))}
					</nav>
				</div>
				<div className="mt-auto flex items-center justify-between border-t border-sidebar-border pt-4">
					<ThemeToggle />
					<Button onClick={onLogout} size="sm" variant="ghost">
						<LogOut /> Sair
					</Button>
				</div>
			</aside>
			<header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
				<Link
					className="display-title text-2xl font-bold text-foreground"
					to="/"
				>
					din din
				</Link>
				<ThemeToggle />
			</header>
			<main className="page-wrap py-6 lg:ml-64 lg:w-auto lg:max-w-none lg:px-8">
				{children}
			</main>
			<nav
				className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-background/90 px-2 py-2 backdrop-blur lg:hidden"
				aria-label="Principal"
			>
				{primaryNavigation.map((item) => (
					<NavigationLink compact item={item} key={item.to} />
				))}
				<NavigationLink compact item={secondaryNavigation[0]} />
			</nav>
		</div>
	);
}
