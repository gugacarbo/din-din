import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("#/components/finance/app-shell.tsx", () => ({
	AppShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("#/lib/finance-query-options.ts", () => ({
	sessionQueryOptions: () => ({
		queryKey: ["finance", "session"],
		queryFn: async () => ({
			name: "Admin",
			email: "admin@example.test",
			image: null,
		}),
	}),
}));

vi.mock("#/server/admin-support.ts", () => ({
	getAdminMembership: async () => ({ isAdmin: true }),
	getAdminSupportDetail: async () => ({
		report_id: "report-with-issue",
		category: "problem",
		status: "published",
		attempts: 1,
		safe_reason: null,
		issue_number: 31,
		issue_url: "https://github.com/gugacarbo/din-din/issues/31",
		created_at: 1,
		review_tasks: [],
		message: "O saldo não atualiza depois de salvar.",
		canManualPublish: false,
		unavailableReason: null,
	}),
	getAdminSupportPage: async () => ({
		items: [
			{
				report_id: "report-with-issue",
				category: "problem",
				status: "published",
				attempts: 1,
				safe_reason: null,
				issue_number: 31,
				issue_url: "https://github.com/gugacarbo/din-din/issues/31",
				created_at: 1,
				review_tasks: [],
			},
			{
				report_id: "report-with-unsafe-issue-url",
				category: "problem",
				status: "published",
				attempts: 1,
				safe_reason: null,
				issue_number: 32,
				issue_url: "https://example.test/issues/32",
				created_at: 2,
				review_tasks: [],
			},
		],
		nextCursor: null,
	}),
}));

import { AdminSupportPage } from "#/components/admin-support-page.tsx";

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<AdminSupportPage />
		</QueryClientProvider>,
	);
}

describe("AdminSupportPage", () => {
	it("links only to a canonical GitHub issue reference", async () => {
		renderPage();

		const issue = await screen.findByRole("link", { name: "Issue #31" });
		expect(issue).toHaveAttribute(
			"href",
			"https://github.com/gugacarbo/din-din/issues/31",
		);
		expect(issue).toHaveAttribute("target", "_blank");
		expect(issue).toHaveAttribute("rel", "noreferrer");
		expect(screen.queryByRole("link", { name: "Issue #32" })).not.toBeInTheDocument();
	});

	it("opens the received message in a dialog", async () => {
		const user = userEvent.setup();
		renderPage();

		const buttons = await screen.findAllByRole("button", {
			name: "Visualizar mensagem: Problema ou erro",
		});
		await user.click(buttons[0]);

		expect(await screen.findByRole("dialog")).toHaveTextContent(
			"O saldo não atualiza depois de salvar.",
		);
	});
});
