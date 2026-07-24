import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	BarChart3,
	CircleUserRound,
	LayoutDashboard,
	List,
	LogOut,
	Plus,
	Settings,
	ShieldCheck,
	WifiOff,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { PwaInstallButton } from "#/components/pwa-install-button.tsx";
import { SupportDialog } from "#/components/support-dialog.tsx";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarSeparator,
	SidebarTrigger,
} from "#/components/ui/sidebar.tsx";
import { adminMembershipQueryOptions } from "#/lib/admin-support-query-options.ts";
import {
	categoriesQueryOptions,
	dashboardQueryOptions,
	invoicesQueryOptions,
	paymentMethodsQueryOptions,
	reportQueryOptions,
	transactionsQueryOptions,
} from "#/lib/finance-query-options.ts";

import { ThemeToggle } from "./theme-toggle.tsx";

const primaryNavigation = [
	{ to: "/" as const, label: "Dashboard", icon: LayoutDashboard },
	{ to: "/transactions" as const, label: "Histórico", icon: List },
	{ to: "/reports" as const, label: "Relatórios", icon: BarChart3 },
];

function NavigationLink({
	item,
}: {
	item: (typeof primaryNavigation)[number];
}) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const active = pathname === item.to;
	const Icon = item.icon;

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				isActive={active}
				render={<Link to={item.to} />}
				tooltip={item.label}
			>
				<Icon />
				<span>{item.label}</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

function UserMenuItems({
	email,
	onLogoutRequest,
	userName,
}: {
	email?: string;
	onLogoutRequest: () => void;
	userName: string;
}) {
	return (
		<>
			<DropdownMenuGroup>
				<DropdownMenuLabel className="max-w-56">
					<p className="truncate">{userName}</p>
					{email && (
						<p className="truncate text-xs font-normal text-muted-foreground">
							{email}
						</p>
					)}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem render={<Link to="/profile" />}>
					<CircleUserRound /> Perfil
				</DropdownMenuItem>
				<DropdownMenuItem render={<Link to="/settings" />}>
					<Settings /> Configurações
				</DropdownMenuItem>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<ThemeToggle />
			<DropdownMenuSeparator />
			<DropdownMenuItem onSelect={onLogoutRequest} variant="destructive">
				<LogOut /> Sair
			</DropdownMenuItem>
		</>
	);
}

function UserMenu({
	user,
	userInitial,
	userName,
	onLogout,
}: {
	user: { name: string; email: string; image?: string | null } | null;
	userInitial: string;
	userName: string;
	onLogout: () => void;
}) {
	const [logoutOpen, setLogoutOpen] = useState(false);
	const avatar = user?.image ? (
		<img
			alt=""
			className="size-8 shrink-0 rounded-lg object-cover"
			src={user.image}
		/>
	) : (
		<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
			{userInitial}
		</span>
	);
	const logoutDialog = (
		<AlertDialog onOpenChange={setLogoutOpen} open={logoutOpen}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Sair da conta?</AlertDialogTitle>
					<AlertDialogDescription>
						Você será desconectado e precisará fazer login novamente para
						acessar o aplicativo.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancelar</AlertDialogCancel>
					<AlertDialogAction onClick={onLogout} variant="destructive">
						Sair
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<SidebarMenuButton
							aria-label="Menu do usuário"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							size="lg"
							tooltip="Menu do usuário"
						/>
					}
				>
					{avatar}
					<span className="truncate group-data-[collapsible=icon]:hidden">
						{userName}
					</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56" side="top">
					<UserMenuItems
						email={user?.email}
						onLogoutRequest={() => setLogoutOpen(true)}
						userName={userName}
					/>
				</DropdownMenuContent>
			</DropdownMenu>
			{logoutDialog}
		</>
	);
}

export function AppShell({
	children,
	offline,
	user,
	onLogout,
	onNewTransaction,
}: {
	children: ReactNode;
	offline: boolean;
	user: { name: string; email: string; image?: string | null } | null;
	onLogout: () => void;
	onNewTransaction: () => void;
}) {
	const queryClient = useQueryClient();
	const membership = useQuery(adminMembershipQueryOptions());
	const userName = user?.name || user?.email || "Usuário";
	const userInitial = userName.trim().charAt(0).toUpperCase() || "U";

	useEffect(() => {
		if (offline) return;
		void Promise.allSettled([
			queryClient.prefetchQuery(dashboardQueryOptions()),
			queryClient.prefetchInfiniteQuery(transactionsQueryOptions("active")),
			queryClient.prefetchQuery(reportQueryOptions()),
			queryClient.prefetchQuery(categoriesQueryOptions("active")),
			queryClient.prefetchQuery(paymentMethodsQueryOptions()),
			queryClient.prefetchQuery(invoicesQueryOptions()),
			queryClient.prefetchInfiniteQuery(transactionsQueryOptions("archived")),
		]);
	}, [offline, queryClient]);

	return (
		<>
			{offline && (
				<div
					className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950"
					role="status"
				>
					<WifiOff aria-hidden="true" className="size-4" />
					Você está offline. Esta visualização é somente leitura.
				</div>
			)}
			<div aria-disabled={offline || undefined} inert={offline}>
				<SidebarProvider>
					<Sidebar className="border-sidebar-border bg-sidebar/90 backdrop-blur">
						<SidebarHeader className="px-4 py-6">
							<Link className="px-2" to="/">
								<p className="font-serif text-3xl font-bold text-primary">
									Din Din
								</p>
								<p className="mt-1 text-[0.69rem] font-bold uppercase tracking-[0.16em]">
									suas finanças, claras
								</p>
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
							{membership.data?.isAdmin && (
								<SidebarGroup>
									<SidebarGroupLabel>Admin</SidebarGroupLabel>
									<SidebarGroupContent>
										<SidebarMenu aria-label="Admin">
											<SidebarMenuItem>
												<SidebarMenuButton
													render={<Link to="/admin/suport" />}
													tooltip="Suporte"
												>
													<ShieldCheck />
													<span>Suporte</span>
												</SidebarMenuButton>
											</SidebarMenuItem>
										</SidebarMenu>
									</SidebarGroupContent>
								</SidebarGroup>
							)}
						</SidebarContent>
						<SidebarFooter>
							<SidebarSeparator />
							<SidebarMenu>
								<SidebarMenuItem>
									<UserMenu
										onLogout={onLogout}
										user={user}
										userInitial={userInitial}
										userName={userName}
									/>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarFooter>
					</Sidebar>
					<SidebarInset className="bg-transparent">
						<header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/90 px-4 backdrop-blur">
							<div className="flex items-center gap-2">
								<SidebarTrigger />
								<Link
									className="font-serif text-2xl font-bold text-primary md:hidden"
									to="/"
								>
									Din Din
								</Link>
								<PwaInstallButton />
							</div>
							<div className="flex items-center gap-2">
								<SupportDialog offline={offline} />
								<Button onClick={onNewTransaction} size="sm">
									<Plus />{" "}
									<span className="hidden sm:inline">Novo lançamento</span>
									<span className="sm:hidden">Novo</span>
								</Button>
							</div>
						</header>
						<main className="mx-auto w-full max-w-[1080px] px-4 py-6 md:max-w-none md:px-8">
							{children}
						</main>
					</SidebarInset>
				</SidebarProvider>
			</div>
		</>
	);
}
