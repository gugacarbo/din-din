import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
	clearAdminInviteToken,
	readAdminInviteToken,
} from "#/lib/admin-invite-client.ts";
import { adminMembershipQueryOptions } from "#/lib/admin-support-query-options.ts";
import { sessionQueryOptions } from "#/lib/finance-query-options.ts";

export const Route = createFileRoute("/admin/convite")({
	// The fragment must be captured by the root script before a route guard can
	// redirect to login. HTTP requests never include fragments.
	ssr: false,
	beforeLoad: async ({ context }) => {
		try {
			await context.queryClient.ensureQueryData(sessionQueryOptions());
		} catch {
			throw redirect({
				to: "/login",
				search: { returnTo: "/admin/convite" },
			});
		}
	},
	component: InvitePage,
});

function inviteErrorMessage(code: string | undefined) {
	switch (code) {
		case "email_not_verified":
			return "Confirme seu e-mail para aceitar este convite.";
		case "email_mismatch":
			return "Este convite já está vinculado a outro e-mail.";
		case "invite_consumed":
			return "Este convite já foi utilizado.";
		case "unauthenticated":
			return "Faça login para aceitar o convite.";
		default:
			return "Convite inválido ou expirado.";
	}
}

function InvitePage() {
	const [token, setToken] = useState(() =>
		typeof window === "undefined" ? undefined : readAdminInviteToken(),
	);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: user } = useQuery(sessionQueryOptions());
	const accept = useMutation({
		mutationFn: async () => {
			if (!token)
				throw new Error("Este convite precisa ser aberto pelo link original.");
			const response = await fetch("/api/admin/invite/accept", {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token }),
			});
			if (response.ok) return;
			const body = (await response.json().catch(() => null)) as {
				code?: string;
			} | null;
			throw new Error(inviteErrorMessage(body?.code));
		},
		onSuccess: async () => {
			clearAdminInviteToken();
			setToken(undefined);
			await queryClient.invalidateQueries({
				queryKey: adminMembershipQueryOptions().queryKey,
			});
			await navigate({ to: "/admin/suport" });
		},
	});
	function cancel() {
		clearAdminInviteToken();
		setToken(undefined);
		void navigate({ to: "/" });
	}
	return (
		<main className="mx-auto grid min-h-dvh w-full max-w-[1080px] place-items-center px-4 py-8">
			<Dialog
				onOpenChange={(open) => {
					if (!open && token) cancel();
				}}
				open={Boolean(token)}
			>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Convite de administrador</DialogTitle>
						<DialogDescription>
							Você está prestes a conceder acesso administrativo a{" "}
							<strong>{user?.email}</strong>.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={accept.isPending}
							onClick={() =>
								void accept.mutateAsync().catch((error: unknown) => {
									toast.error(
										error instanceof Error
											? error.message
											: "Não foi possível aceitar o convite.",
									);
								})
							}
						>
							{accept.isPending ? "Aceitando…" : "Aceitar convite"}
						</Button>
						<Button
							disabled={accept.isPending}
							onClick={cancel}
							variant="outline"
						>
							Cancelar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{!token && (
				<p className="text-sm text-muted-foreground">
					Este convite precisa ser aberto pelo link original.
				</p>
			)}
		</main>
	);
}
