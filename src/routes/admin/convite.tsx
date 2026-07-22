import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "#/components/ui/alert.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	clearAdminInviteToken,
	readAdminInviteToken,
} from "#/lib/admin-invite-client.ts";
import { authClient } from "#/lib/auth-client.ts";

const emailSchema = z.object({
	email: z.string().trim().email("Informe o e-mail convidado."),
});
type EmailValues = z.infer<typeof emailSchema>;

export const Route = createFileRoute("/admin/convite")({
	component: InvitePage,
});

export function InvitePage() {
	const [error, setError] = useState<string | null>(null);
	const [token, setToken] = useState(() =>
		typeof window === "undefined" ? undefined : readAdminInviteToken(),
	);
	const preparingOAuth = useRef(false);
	const form = useForm<EmailValues>({
		defaultValues: { email: "" },
		resolver: zodResolver(emailSchema),
	});
	const prepare = useMutation({
		mutationFn: async (data: EmailValues) => {
			if (!token)
				throw new Error("Este convite precisa ser aberto pelo link original.");
			const response = await fetch("/api/admin/invite/prepare", {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ...data, token }),
			});
			if (!response.ok) throw new Error("Convite inválido ou expirado.");
		},
	});
	const conclude = useMutation({
		mutationFn: async () => {
			const response = await fetch("/api/admin/invite/conclude", {
				method: "POST",
				credentials: "same-origin",
			});
			if (!response.ok) throw new Error("Não foi possível concluir o convite.");
		},
	});
	useEffect(() => {
		if (token || preparingOAuth.current) return;
		void conclude.mutateAsync().catch(() => undefined);
	}, [conclude, token]);
	async function submit(values: EmailValues) {
		setError(null);
		try {
			await prepare.mutateAsync(values);
			preparingOAuth.current = true;
			clearAdminInviteToken();
			setToken(undefined);
			const result = await authClient.signIn.social({
				provider: "google",
				callbackURL: "/admin/convite",
			});
			if (result.error)
				throw new Error(
					result.error.message ?? "Não foi possível iniciar o login.",
				);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível preparar o convite.",
			);
		}
	}
	return (
		<main className="page-wrap grid min-h-dvh place-items-center py-8">
			<Card className="w-full max-w-md">
				<CardContent className="p-6">
					<h1 className="text-xl font-semibold">Convite de administrador</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Confirme o e-mail convidado e entre com Google.
					</p>
					<form
						className="mt-6 grid gap-4"
						noValidate
						onSubmit={form.handleSubmit(submit)}
					>
						<Field data-invalid={Boolean(form.formState.errors.email)}>
							<FieldLabel htmlFor="invite-email">E-mail</FieldLabel>
							<Input
								aria-invalid={Boolean(form.formState.errors.email)}
								{...form.register("email")}
								id="invite-email"
								type="email"
							/>
							<FieldError errors={[form.formState.errors.email]} />
						</Field>
						<Button
							disabled={prepare.isPending || form.formState.isSubmitting}
							type="submit"
						>
							Continuar com Google
						</Button>
					</form>
					{error && (
						<Alert className="mt-4" variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					{!token && conclude.isSuccess && (
						<p className="mt-4 text-sm">Acesso de administrador concedido.</p>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
