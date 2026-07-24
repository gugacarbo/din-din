import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { lazy, Suspense, type ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("#/server/finance.ts", () => ({ getSessionUser: vi.fn() }));
vi.mock("#/lib/auth-client.ts", () => ({
	authClient: { signIn: { social: vi.fn() } },
}));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: object) => ({ options }),
	lazyRouteComponent: (
		importer: () => Promise<Record<string, ComponentType>>,
		exportName: string,
	) => lazy(async () => ({ default: (await importer())[exportName] })),
	redirect: vi.fn(),
}));

import { Route } from "#/routes/login.tsx";

const Login = Route.options.component;

function renderLogin() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<Suspense fallback={null}>
				<Login />
			</Suspense>
		</QueryClientProvider>,
	);
}

describe("Login", () => {
	it("shows the direct-email form in development", async () => {
		renderLogin();

		expect(await screen.findByLabelText("E-mail de desenvolvimento")).toHaveAttribute(
			"type",
			"email",
		);
		expect(
			screen.getByRole("button", { name: "Entrar com e-mail (dev)" }),
		).toBeInTheDocument();
	});

	it("validates the development email before submitting", async () => {
		const user = userEvent.setup();
		renderLogin();

		await user.type(
			await screen.findByLabelText("E-mail de desenvolvimento"),
			"invalido",
		);
		await user.click(
			screen.getByRole("button", { name: "Entrar com e-mail (dev)" }),
		);

		expect(await screen.findByText("Informe um e-mail válido.")).toHaveAttribute(
			"role",
			"alert",
		);
	});
});
