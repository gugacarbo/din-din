import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { Alert, AlertDescription } from "#/components/ui/alert.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { authClient } from "#/lib/auth-client.ts";
import { getSessionUser } from "#/server/finance.ts";

export const Route = createFileRoute("/login")({
	beforeLoad: async () => {
		try {
			await getSessionUser();
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
	const [email, setEmail] = useState("");
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
	async function loginWithEmail() {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch("/api/auth/dev-login", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email }),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				throw new Error(
					body?.message ?? "Não foi possível entrar com este e-mail.",
				);
			}
			window.location.assign("/");
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Não foi possível entrar com este e-mail.",
			);
			setLoading(false);
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
							onSubmit={(event) => {
								event.preventDefault();
								void loginWithEmail();
							}}
						>
							<label className="sr-only" htmlFor="dev-login-email">
								E-mail de desenvolvimento
							</label>
							<input
								autoComplete="email"
								className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
								disabled={loading}
								id="dev-login-email"
								onChange={(event) => setEmail(event.target.value)}
								placeholder="voce@exemplo.com"
								required
								type="email"
								value={email}
							/>
							<Button
								disabled={loading}
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
