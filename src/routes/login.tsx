import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "#/components/ui/button.tsx";
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

function Login() {
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
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
	return (
		<main className="page-wrap grid min-h-dvh place-items-center py-8">
			<section className="island-shell w-full max-w-md rounded-3xl p-8 text-center">
				<p className="island-kicker">finanças pessoais</p>
				<h1 className="display-title mt-2 text-5xl font-bold text-foreground">
					din din
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
				{error && <p className="mt-4 text-sm text-destructive">{error}</p>}
			</section>
		</main>
	);
}
