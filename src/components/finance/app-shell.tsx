import { Link, useRouterState } from "@tanstack/react-router";
import {
	ArchiveRestore,
	BarChart3,
	LayoutDashboard,
	List,
	LogOut,
	Plus,
	Tags,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarSeparator,
	SidebarTrigger,
} from "#/components/ui/sidebar.tsx";

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
}: {
	item:
		| (typeof primaryNavigation)[number]
		| (typeof secondaryNavigation)[number];
}) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const active = pathname === item.to;
	const Icon = item.icon;

	return (
		<SidebarMenuItem>
			<SidebarMenuButton asChild isActive={active} tooltip={item.label}>
				<Link to={item.to}>
					<Icon />
					<span>{item.label}</span>
				</Link>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

export function AppShell({
	children,
	onLogout,
	onNewTransaction,
}: {
	children: ReactNode;
	onLogout: () => void;
	onNewTransaction: () => void;
}) {
	return (
		<SidebarProvider>
			<Sidebar className="border-sidebar-border bg-sidebar/90 backdrop-blur">
				<SidebarHeader className="px-4 py-6">
					<Link className="px-2" to="/">
						<p className="display-title text-3xl font-bold text-foreground">
							Din Din
						</p>
						<p className="island-kicker mt-1">suas finanças, claras</p>
					</Link>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarMenu aria-label="Principal">
								{primaryNavigation.map((item) => (
									<NavigationLink item={item} key={item.to} />
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarMenu aria-label="Secundária">
								{secondaryNavigation.map((item) => (
									<NavigationLink item={item} key={item.to} />
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<SidebarSeparator />
					<div className="flex items-center justify-between px-2 pb-2">
						<ThemeToggle />
						<Button onClick={onLogout} size="sm" variant="ghost">
							<LogOut /> Sair
						</Button>
					</div>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset className="bg-transparent">
				<header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/90 px-4 backdrop-blur">
					<div className="flex items-center gap-2">
						<SidebarTrigger />
						<Link
							className="display-title text-2xl font-bold text-foreground md:hidden"
							to="/"
						>
							Din Din
						</Link>
					</div>
					<div className="flex items-center gap-2">
						<Button onClick={onNewTransaction} size="sm">
							<Plus /> <span className="hidden sm:inline">Novo lançamento</span>
							<span className="sm:hidden">Novo</span>
						</Button>
						<div className="md:hidden">
							<ThemeToggle />
						</div>
					</div>
				</header>
				<nav
					aria-label="Navegação mobile"
					className="border-b border-border px-4 py-2 md:hidden"
				>
					<Link className="text-sm font-bold" to="/archive">
						Arquivo
					</Link>
				</nav>
				<main className="page-wrap py-6 md:max-w-none md:px-8">{children}</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
