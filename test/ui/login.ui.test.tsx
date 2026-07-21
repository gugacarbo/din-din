import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("#/server/finance.ts", () => ({ getSessionUser: vi.fn() }));
vi.mock("#/lib/auth-client.ts", () => ({
	authClient: { signIn: { social: vi.fn() } },
}));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({}),
	redirect: vi.fn(),
}));

import { Login } from "#/routes/login.tsx";

function renderLogin() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<Login />
		</QueryClientProvider>,
	);
}

describe("Login", () => {
	it("shows the direct-email form in development", () => {
		renderLogin();

		expect(screen.getByLabelText("E-mail de desenvolvimento")).toHaveAttribute(
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
			screen.getByLabelText("E-mail de desenvolvimento"),
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
