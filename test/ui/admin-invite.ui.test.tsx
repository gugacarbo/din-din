import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const social = vi.hoisted(() => vi.fn());

vi.mock("#/lib/auth-client.ts", () => ({
	authClient: { signIn: { social } },
}));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({}),
}));

import {
	adminInviteTokenStorageKey,
	inviteFragmentScript,
} from "#/lib/admin-invite-client.ts";
import { InvitePage } from "#/routes/admin/convite.tsx";

function renderInvite() {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<InvitePage />
		</QueryClientProvider>,
	);
}

describe("admin invite page", () => {
	beforeEach(() => {
		window.sessionStorage.clear();
		window.history.replaceState(null, "", "/admin/convite");
		social.mockReset();
		social.mockResolvedValue({});
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

	it("keeps the captured token across a rerender, posts it, and clears it only after success", async () => {
		const token = "t".repeat(32);
		window.sessionStorage.setItem(adminInviteTokenStorageKey, token);
		const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
		vi.stubGlobal("fetch", fetcher);
		const user = userEvent.setup();
		const view = renderInvite();

		view.rerender(
			<QueryClientProvider
				client={new QueryClient({
					defaultOptions: { mutations: { retry: false } },
				})}
			>
				<InvitePage />
			</QueryClientProvider>,
		);
		await user.type(screen.getByLabelText("E-mail"), "admin@example.com");
		await user.click(screen.getByRole("button", { name: "Continuar com Google" }));

		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
		expect(fetcher).toHaveBeenCalledWith(
			"/api/admin/invite/prepare",
			expect.objectContaining({
				body: JSON.stringify({ email: "admin@example.com", token }),
				method: "POST",
			}),
		);
		expect(window.sessionStorage.getItem(adminInviteTokenStorageKey)).toBeNull();
		expect(social).toHaveBeenCalledWith({
			callbackURL: "/admin/convite",
			provider: "google",
		});
	});

	it("keeps the token available when prepare fails", async () => {
		const token = "t".repeat(32);
		window.sessionStorage.setItem(adminInviteTokenStorageKey, token);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 400 })),
		);
		const user = userEvent.setup();
		renderInvite();
		await user.type(screen.getByLabelText("E-mail"), "admin@example.com");
		await user.click(screen.getByRole("button", { name: "Continuar com Google" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Convite inválido ou expirado.",
		);
		expect(window.sessionStorage.getItem(adminInviteTokenStorageKey)).toBe(token);
		expect(social).not.toHaveBeenCalled();
	});
});
