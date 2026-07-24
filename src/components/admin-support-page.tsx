import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Eye, Inbox, MessageSquareText } from "lucide-react";
import { useState } from "react";

import { AppShell } from "#/components/finance/app-shell.tsx";
import { GitHubIssueReference } from "#/components/github-issue-reference.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { useOnlineStatus } from "#/hooks/use-online-status.ts";
import {
	adminSupportDetailQueryOptions,
	adminSupportQueryOptions,
} from "#/lib/admin-support-query-options.ts";
import { authClient } from "#/lib/auth-client.ts";
import { sessionQueryOptions } from "#/lib/finance-query-options.ts";
import { clearNavigationCache } from "#/lib/pwa.ts";

const categoryLabels: Record<string, string> = {
	problem: "Problema ou erro",
	question: "Dúvida ou ajuda",
	suggestion: "Sugestão",
};

const statusLabels: Record<string, string> = {
	queued: "Na fila",
	processing: "Em análise",
	published: "Publicada",
	manual_review: "Revisão manual",
	failed: "Falhou",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "America/Sao_Paulo",
});

function labelFor(labels: Record<string, string>, value: string) {
	return labels[value] ?? value;
}

function SupportMessageDialog({
	onOpenChange,
	reportId,
}: {
	onOpenChange: (open: boolean) => void;
	reportId: string | null;
}) {
	const detail = useQuery({
		...adminSupportDetailQueryOptions(reportId ?? ""),
		enabled: Boolean(reportId),
	});

	return (
		<Dialog onOpenChange={onOpenChange} open={Boolean(reportId)}>
			<DialogContent className="max-h-[min(760px,calc(100dvh-2rem))] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="pr-8 text-lg">Mensagem recebida</DialogTitle>
					<DialogDescription>
						Conteúdo privado disponível somente para administradores enquanto
						estiver no período de retenção.
					</DialogDescription>
				</DialogHeader>

				{detail.isPending ? (
					<div
						aria-label="Carregando mensagem"
						className="grid gap-3"
						role="status"
					>
						<Skeleton className="h-5 w-48" />
						<Skeleton className="h-28 w-full" />
					</div>
				) : detail.error ? (
					<p className="text-sm text-destructive" role="alert">
						Não foi possível abrir a mensagem.
					</p>
				) : (
					<div className="grid gap-5">
						<div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
							<span>{labelFor(categoryLabels, detail.data.category)}</span>
							<span>{labelFor(statusLabels, detail.data.status)}</span>
							<time dateTime={new Date(detail.data.created_at).toISOString()}>
								{dateFormatter.format(detail.data.created_at)}
							</time>
						</div>

						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Mensagem
							</p>
							{detail.data.message ? (
								<p className="whitespace-pre-wrap border-l-2 border-primary bg-muted/40 px-4 py-3 text-sm leading-6 text-foreground">
									{detail.data.message}
								</p>
							) : (
								<p className="bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
									O conteúdo desta mensagem expirou e não está mais disponível.
								</p>
							)}
						</div>

						<div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
							<span className="text-sm text-muted-foreground">
								{detail.data.attempts}{" "}
								{detail.data.attempts === 1 ? "tentativa" : "tentativas"} de
								processamento
							</span>
							<GitHubIssueReference
								issueNumber={detail.data.issue_number}
								issueUrl={detail.data.issue_url}
							/>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function SupportList() {
	const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
	const reports = useInfiniteQuery(adminSupportQueryOptions());
	const items = reports.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<>
			<div className="mb-6 flex items-start gap-3">
				<div className="mt-1 flex size-10 shrink-0 items-center justify-center bg-primary/10 text-primary">
					<MessageSquareText aria-hidden="true" className="size-5" />
				</div>
				<div>
					<h1 className="font-serif text-3xl font-bold text-foreground">
						Mensagens de suporte
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Acompanhe os relatos recebidos e abra uma mensagem para visualizar o
						conteúdo.
					</p>
				</div>
			</div>

			{reports.isPending ? (
				<div
					aria-label="Carregando relatos"
					className="grid gap-3"
					role="status"
				>
					{[0, 1, 2].map((item) => (
						<Skeleton className="h-28 w-full" key={item} />
					))}
				</div>
			) : reports.error ? (
				<Card>
					<CardContent className="py-8 text-center">
						<p className="text-sm text-destructive" role="alert">
							Não foi possível carregar as mensagens.
						</p>
						<Button
							className="mt-4"
							onClick={() => void reports.refetch()}
							variant="outline"
						>
							Tentar novamente
						</Button>
					</CardContent>
				</Card>
			) : items.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center py-12 text-center">
						<Inbox
							aria-hidden="true"
							className="mb-3 size-8 text-muted-foreground"
						/>
						<p className="font-medium text-foreground">
							Nenhuma mensagem recebida
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Os novos relatos de suporte aparecerão aqui.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-3">
					{items.map((report) => (
						<Card key={report.report_id}>
							<CardHeader className="gap-2 pr-28 sm:pr-32">
								<CardTitle className="text-base">
									{labelFor(categoryLabels, report.category)}
								</CardTitle>
								<CardDescription>
									Recebida em {dateFormatter.format(report.created_at)}
								</CardDescription>
								<CardAction>
									<Button
										aria-label={`Visualizar mensagem: ${labelFor(categoryLabels, report.category)}`}
										onClick={() => setSelectedReportId(report.report_id)}
										variant="outline"
									>
										<Eye aria-hidden="true" />
										Visualizar
									</Button>
								</CardAction>
							</CardHeader>
							<CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2">
								<span className="bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
									{labelFor(statusLabels, report.status)}
								</span>
								<span className="text-xs text-muted-foreground">
									{report.attempts}{" "}
									{report.attempts === 1 ? "tentativa" : "tentativas"}
								</span>
								<GitHubIssueReference
									issueNumber={report.issue_number}
									issueUrl={report.issue_url}
								/>
							</CardContent>
						</Card>
					))}

					{reports.hasNextPage && (
						<Button
							className="justify-self-center"
							disabled={reports.isFetchingNextPage}
							onClick={() => void reports.fetchNextPage()}
							variant="outline"
						>
							{reports.isFetchingNextPage
								? "Carregando…"
								: "Carregar mais mensagens"}
						</Button>
					)}
				</div>
			)}

			<SupportMessageDialog
				onOpenChange={(open) => {
					if (!open) setSelectedReportId(null);
				}}
				reportId={selectedReportId}
			/>
		</>
	);
}

export function AdminSupportPage() {
	const { data: sessionUser } = useQuery(sessionQueryOptions());
	const online = useOnlineStatus();
	const logout = async () => {
		await authClient.signOut();
		await clearNavigationCache().catch(() => undefined);
		window.location.assign("/login");
	};

	return (
		<AppShell
			offline={!online}
			onLogout={() => void logout()}
			user={sessionUser ?? null}
		>
			<SupportList />
		</AppShell>
	);
}
