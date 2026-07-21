import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription } from "#/components/ui/alert.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import { authClient } from "#/lib/auth-client.ts";
import { sessionQueryOptions } from "#/lib/finance-query-options.ts";

const devLoginSchema = z.object({
	email: z.string().trim().email("Informe um e-mail válido."),
});
type DevLoginValues = z.infer<typeof devLoginSchema>;

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context }) => {
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
	const [error, setError] = useState<string | null>(null);
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
		setError(null);
		const result = await authClient.signIn.social({
			provider: "google",
			callbackURL: "/",
		});
		if (result.error) {
			setError(result.error.message ?? "Não foi possível iniciar o login.");
			setLoading(false);
		}
	}
	async function loginWithEmail({ email }: DevLoginValues) {
		setError(null);
		try {
			await devLogin.mutateAsync({ email });
			window.location.assign("/");
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível entrar com este e-mail.",
			);
		}
	}
	return (
		<main className="page-wrap grid min-h-dvh place-items-center py-8">
			<Card className="island-shell w-full max-w-md rounded-3xl py-0 shadow-none">
				<CardContent className="p-8 text-center">
					<p className="island-kicker">finanças pessoais</p>
					<h1 className="display-title mt-2 text-5xl font-bold text-foreground">
						Din Din
					</h1>
					<p className="mt-4 text-muted-foreground">
						Clareza para cuidar do seu dinheiro, um lançamento de cada vez.
					</p>
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
					{error && (
						<Alert className="mt-4 text-left" variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
