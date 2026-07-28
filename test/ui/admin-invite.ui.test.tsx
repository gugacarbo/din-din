import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { lazy, Suspense, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const notifyError = vi.hoisted(() => vi.fn());
const getSessionUser = vi.hoisted(() => vi.fn());

vi.mock("#/server/finance.ts", () => ({ getSessionUser }));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: object) => ({ options }),
	lazyRouteComponent: (
		importer: () => Promise<Record<string, ComponentType>>,
		exportName: string,
	) => lazy(async () => ({ default: (await importer())[exportName] })),
	redirect: vi.fn(),
	useNavigate: () => navigate,
}));
vi.mock("sonner", () => ({ toast: { error: notifyError } }));

import {
	adminInviteTokenStorageKey,
	inviteFragmentScript,
} from "#/lib/admin-invite-client.ts";
import { Route } from "#/routes/admin/convite.tsx";

const InvitePage = Route.options.component;

function renderInvite() {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<Suspense fallback={null}>
				<InvitePage />
			</Suspense>
		</QueryClientProvider>,
	);
}

describe("admin invite page", () => {
	beforeEach(() => {
		window.sessionStorage.clear();
		window.history.replaceState(null, "", "/admin/convite");
		navigate.mockReset();
		notifyError.mockReset();
		getSessionUser.mockResolvedValue({
			id: "user-1",
			name: "Ana",
			email: "ana@example.com",
			image: null,
		});
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("captures the original fragment in session storage before removing it", () => {
		const token = "t".repeat(32);
		window.history.replaceState(null, "", `/admin/convite#${token}`);

		Function(inviteFragmentScript)();

		expect(window.sessionStorage.getItem(adminInviteTokenStorageKey)).toBe(token);
		expect(window.location.hash).toBe("");
	});

	it("shows the authenticated e-mail and accepts only after an explicit confirmation", async () => {
		const token = "t".repeat(32);
		window.sessionStorage.setItem(adminInviteTokenStorageKey, token);
		const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
		vi.stubGlobal("fetch", fetcher);
		const user = userEvent.setup();
		renderInvite();

		expect(
			await screen.findByText(/ana@example\.com/),
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Aceitar convite" }));

		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
		expect(fetcher).toHaveBeenCalledWith(
			"/api/admin/invite/accept",
			expect.objectContaining({
				body: JSON.stringify({ token }),
				method: "POST",
			}),
		);
		expect(window.sessionStorage.getItem(adminInviteTokenStorageKey)).toBeNull();
		expect(navigate).toHaveBeenCalledWith({ to: "/admin/suport" });
	});

	it("keeps the token available when acceptance fails", async () => {
		const token = "t".repeat(32);
		window.sessionStorage.setItem(adminInviteTokenStorageKey, token);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(Response.json({ code: "invalid_invite" }, { status: 400 })),
		);
		const user = userEvent.setup();
		renderInvite();
		await user.click(await screen.findByRole("button", { name: "Aceitar convite" }));

		await waitFor(() =>
			expect(notifyError).toHaveBeenCalledWith("Convite inválido ou expirado."),
		);
		expect(window.sessionStorage.getItem(adminInviteTokenStorageKey)).toBe(token);
		expect(navigate).not.toHaveBeenCalled();
	});

	it("cancels locally without consuming the remote invitation", async () => {
		window.sessionStorage.setItem(adminInviteTokenStorageKey, "t".repeat(32));
		const user = userEvent.setup();
		renderInvite();
		await user.click(await screen.findByRole("button", { name: "Cancelar" }));

		expect(window.sessionStorage.getItem(adminInviteTokenStorageKey)).toBeNull();
		expect(navigate).toHaveBeenCalledWith({ to: "/" });
		expect(fetch).not.toHaveBeenCalled();
	});
});
