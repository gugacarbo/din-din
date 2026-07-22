import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, ...props }: { to: string; children: ReactNode }) =>
		createElement("a", { href: to, ...props }, children),
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
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				Response.json({
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
			),
		);
	});

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
});
