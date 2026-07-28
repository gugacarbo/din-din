import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const notifySuccess = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: notifySuccess },
}));

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
		updated_at: 3,
		attempt_logs: [
			{
				id: "attempt-1",
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				agent_key: "issue-writer",
				input_tokens: 30,
				output_tokens: 12,
				total_tokens: 42,
				ttft_ms: 640,
				duration_ms: 640,
				success: true,
				error_message: null,
				created_at: 2,
			},
		],
		review_tasks: [
			{
				event_id: "manual:report-with-issue:unsafe_public_content",
				kind: "manual_review",
				reason: "unsafe_public_content",
				status: "observed",
				created_at: 2,
				updated_at: 2,
			},
		],
		message: "O saldo não atualiza depois de salvar.",
		agent_response: '{"title":"Resposta incompleta"',
		agent_response_error: "Expected ',' or '}' after property value",
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
				updated_at: 3,
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
				updated_at: 2,
				review_tasks: [],
			},
		],
		nextCursor: null,
	}),
}));

import { AdminSupportPage } from "#/components/admin-support-page.tsx";

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

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

	it("shows the issue creation log in the agent log tab", async () => {
		const user = userEvent.setup();
		renderPage();

		const buttons = await screen.findAllByRole("button", {
			name: "Visualizar mensagem: Problema ou erro",
		});
		await user.click(buttons[0]);

		const dialog = await screen.findByRole("dialog");
		expect(
			screen.getByRole("tab", { name: "Mensagem", selected: true }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("tab", { name: "Log do agente", selected: false }),
		).toBeInTheDocument();
		expect(dialog).not.toHaveTextContent("Log de criação da issue");

		await user.click(screen.getByRole("tab", { name: "Log do agente" }));

		expect(
			screen.getByRole("tab", { name: "Log do agente", selected: true }),
		).toBeInTheDocument();
		expect(dialog).toHaveTextContent("Log de criação da issue");
		expect(dialog).toHaveTextContent("Issue criada com sucesso");
		expect(dialog).toHaveTextContent("1 tentativa automática");
		expect(dialog).toHaveTextContent("Tentativa 1 · Concluída");
		expect(dialog).toHaveTextContent("Resposta privada do agente");
		expect(dialog).toHaveTextContent('{"title":"Resposta incompleta"');
		expect(dialog).toHaveTextContent(
			"Erro de interpretação: Expected ',' or '}' after property value",
		);
		expect(dialog).toHaveTextContent("42 tokens");
		expect(dialog).toHaveTextContent(
			"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
		);
		expect(dialog).toHaveTextContent("Revisão manual · Recebida");
		expect(dialog).toHaveTextContent(
			"O conteúdo sugerido para a issue foi bloqueado pela proteção de privacidade.",
		);
		expect(dialog).toHaveTextContent("unsafe_public_content");
	});

	it("confirms and deletes a received message", async () => {
		const user = userEvent.setup();
		const deleteRequest = vi.fn(async () => ({ ok: true }));
		vi.stubGlobal("fetch", deleteRequest);
		renderPage();

		const buttons = await screen.findAllByRole("button", {
			name: "Visualizar mensagem: Problema ou erro",
		});
		await user.click(buttons[0]);
		await user.click(
			await screen.findByRole("button", { name: "Excluir mensagem" }),
		);

		expect(await screen.findByRole("alertdialog")).toHaveTextContent(
			"Uma issue já publicada no GitHub não será apagada.",
		);
		await user.click(
			screen.getByRole("button", { name: "Excluir definitivamente" }),
		);

		await waitFor(() =>
			expect(deleteRequest).toHaveBeenCalledWith(
				"/api/admin/support/report-with-issue",
				{ method: "DELETE" },
			),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("heading", { name: "Mensagem recebida" }),
			).not.toBeInTheDocument(),
		);
		expect(notifySuccess).toHaveBeenCalledWith("Mensagem excluída.");
	});
});
