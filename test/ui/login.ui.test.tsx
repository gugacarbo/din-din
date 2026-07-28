import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { lazy, Suspense, type ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	signInSocial: vi.fn(),
}));
const search = vi.hoisted(() => vi.fn());

vi.mock("#/server/finance.ts", () => ({ getSessionUser: vi.fn() }));
vi.mock("#/lib/auth-client.ts", () => ({
	authClient: { signIn: { social: api.signInSocial } },
}));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: object) => ({ options }),
	lazyRouteComponent: (
		importer: () => Promise<Record<string, ComponentType>>,
		exportName: string,
	) => lazy(async () => ({ default: (await importer())[exportName] })),
	redirect: vi.fn(),
	useSearch: () => search(),
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
	beforeEach(() => {
		search.mockReturnValue({});
		api.signInSocial.mockReset();
	});
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

	it("ignores an unsafe login return path", () => {
		const validator = Route.options.validateSearch as {
			parse(input: unknown): unknown;
		};
		expect(validator.parse({ returnTo: "https://evil.example" })).toEqual({});
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

	it("recovers the Google login action when the client rejects", async () => {
		const user = userEvent.setup();
		api.signInSocial.mockRejectedValueOnce(new Error("Google indisponível"));
		renderLogin();

		const button = await screen.findByRole("button", {
			name: "Entrar com Google",
		});
		await user.click(button);

		expect(
			await screen.findByRole("button", { name: "Entrar com Google" }),
		).toBeEnabled();
		expect(api.signInSocial).toHaveBeenCalledWith({
			provider: "google",
			callbackURL: "/",
		});
	});

	it("uses the invitation return path for Google login", async () => {
		search.mockReturnValue({ returnTo: "/admin/convite" });
		api.signInSocial.mockRejectedValueOnce(new Error("Google indisponível"));
		const user = userEvent.setup();
		renderLogin();
		await user.click(await screen.findByRole("button", { name: "Entrar com Google" }));

		expect(api.signInSocial).toHaveBeenCalledWith({
			provider: "google",
			callbackURL: "/admin/convite",
		});
	});
});
