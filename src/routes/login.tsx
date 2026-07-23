import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "#/components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import { authClient } from "#/lib/auth-client.ts";
import { sessionQueryOptions } from "#/lib/finance-query-options.ts";
import { isOfflineNavigation } from "#/lib/pwa.ts";

const devLoginSchema = z.object({
	email: z.string().trim().email("Informe um e-mail válido."),
});
type DevLoginValues = z.infer<typeof devLoginSchema>;

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context }) => {
		if (isOfflineNavigation()) return;
		try {
			await context.queryClient.ensureQueryData(sessionQueryOptions());
			throw redirect({ to: "/" });
		} catch (error) {
			if (error && typeof error === "object" && "isRedirect" in error)
				throw error;
		}
	},
	component: Login,
});

export function Login() {
	const [loading, setLoading] = useState(false);
	const form = useForm<DevLoginValues>({
		defaultValues: { email: "" },
		resolver: zodResolver(devLoginSchema),
	});
	const devLogin = useMutation({
		mutationFn: async ({ email }: DevLoginValues) => {
			const response = await fetch("/api/auth/dev-login", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email }),
			});
			if (response.ok) return;
			const body = (await response.json().catch(() => null)) as {
				message?: string;
			} | null;
			throw new Error(
				body?.message ?? "Não foi possível entrar com este e-mail.",
			);
		},
	});
	async function login() {
		setLoading(true);
		const result = await authClient.signIn.social({
			provider: "google",
			callbackURL: "/",
		});
		if (result.error) {
			toast.error(result.error.message ?? "Não foi possível iniciar o login.");
			setLoading(false);
		}
	}
	async function loginWithEmail({ email }: DevLoginValues) {
		try {
			await devLogin.mutateAsync({ email });
			window.location.assign("/");
		} catch (cause) {
			toast.error(
				cause instanceof Error
					? cause.message
					: "Não foi possível entrar com este e-mail.",
			);
		}
	}
	return (
		<main className="page-wrap grid min-h-dvh place-items-center py-8">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<p className="island-kicker">finanças pessoais</p>
					<CardTitle className="display-title text-5xl font-bold text-foreground">
						Din Din
					</CardTitle>
					<CardDescription>
						Clareza para cuidar do seu dinheiro, um lançamento de cada vez.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						className="mt-8 w-full"
						disabled={loading}
						onClick={() => void login()}
						size="lg"
					>
						{loading ? "Redirecionando…" : "Entrar com Google"}
					</Button>
					{import.meta.env.DEV && (
						<form
							className="mt-4 grid gap-3"
							noValidate
							onSubmit={form.handleSubmit(loginWithEmail)}
						>
							<Field data-invalid={Boolean(form.formState.errors.email)}>
								<FieldLabel className="sr-only" htmlFor="dev-login-email">
									E-mail de desenvolvimento
								</FieldLabel>
								<Input
									aria-invalid={Boolean(form.formState.errors.email)}
									{...form.register("email")}
									autoComplete="email"
									className="h-11"
									disabled={loading || form.formState.isSubmitting}
									id="dev-login-email"
									placeholder="voce@exemplo.com"
									required
									type="email"
								/>
								<FieldError errors={[form.formState.errors.email]} />
							</Field>
							<Button
								disabled={loading || form.formState.isSubmitting}
								size="lg"
								type="submit"
								variant="outline"
							>
								Entrar com e-mail (dev)
							</Button>
						</form>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
