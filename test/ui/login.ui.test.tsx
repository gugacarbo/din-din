import { render, screen } from "@testing-library/react";
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

describe("Login", () => {
	it("shows the direct-email form in development", () => {
		render(<Login />);

		expect(screen.getByLabelText("E-mail de desenvolvimento")).toHaveAttribute(
			"type",
			"email",
		);
		expect(
			screen.getByRole("button", { name: "Entrar com e-mail (dev)" }),
		).toBeInTheDocument();
	});
});
