import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	CircleAlert,
	CircleCheck,
	Clock3,
	Eye,
	Inbox,
	MessageSquareText,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "#/components/finance/app-shell.tsx";
import { GitHubIssueReference } from "#/components/github-issue-reference.tsx";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
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
	type AdminSupportDetail,
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

const processingOutcomeLabels: Record<string, string> = {
	pending: "Aguardando processamento automático",
	queued: "Aguardando uma nova tentativa",
	processing: "Criação da issue em andamento",
	published: "Issue criada com sucesso",
	manual_review: "Criação automática interrompida para revisão",
	failed: "Não foi possível criar a issue",
};

const processingReasonLabels: Record<string, string> = {
	github_ambiguous:
		"O GitHub não confirmou se a issue foi criada; uma nova publicação automática foi bloqueada.",
	invalid_ai_output:
		"A resposta da IA não tinha o formato necessário para criar a issue.",
	needs_human: "A tentativa precisa de análise manual.",
	publication_reservation_ambiguous:
		"A publicação foi interrompida após ser reservada e precisa de conferência manual.",
	transient_retries_exhausted:
		"As tentativas automáticas foram esgotadas sem criar a issue.",
	unsafe_public_content:
		"O conteúdo sugerido para a issue foi bloqueado pela proteção de privacidade.",
};

const reviewKindLabels: Record<string, string> = {
	manual_review: "Revisão manual",
	transient_failure: "Falha após novas tentativas",
};

const reviewStatusLabels: Record<string, string> = {
	pending: "Pendente",
	sent: "Enviada",
	observed: "Recebida",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "America/Sao_Paulo",
});

function labelFor(labels: Record<string, string>, value: string) {
	return labels[value] ?? value;
}

function formatDuration(milliseconds: number) {
	return milliseconds < 1_000
		? `${milliseconds} ms`
		: `${(milliseconds / 1_000).toLocaleString("pt-BR", {
				maximumFractionDigits: 1,
			})} s`;
}

function SupportProcessingLog({ report }: { report: AdminSupportDetail }) {
	const successful = report.status === "published";
	const inProgress = ["pending", "queued", "processing"].includes(
		report.status,
	);
	const OutcomeIcon = successful
		? CircleCheck
		: inProgress
			? Clock3
			: CircleAlert;
	const orderedReviewTasks = [...report.review_tasks].sort(
		(left, right) => left.created_at - right.created_at,
	);

	return (
		<section aria-labelledby="support-processing-log-title">
			<h3
				className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
				id="support-processing-log-title"
			>
				Log de criação da issue
			</h3>
			<div className="border border-border bg-muted/20">
				<div className="flex gap-3 p-4">
					<OutcomeIcon
						aria-hidden="true"
						className={
							successful
								? "mt-0.5 size-4 shrink-0 text-emerald-500"
								: inProgress
									? "mt-0.5 size-4 shrink-0 text-muted-foreground"
									: "mt-0.5 size-4 shrink-0 text-destructive"
						}
					/>
					<div className="min-w-0">
						<p className="text-sm font-medium text-foreground">
							{labelFor(processingOutcomeLabels, report.status)}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{report.attempts}{" "}
							{report.attempts === 1
								? "tentativa automática"
								: "tentativas automáticas"}{" "}
							· Atualizado em {dateFormatter.format(report.updated_at)}
						</p>
						{report.safe_reason && (
							<div className="mt-3 text-xs/relaxed text-muted-foreground">
								<p>{labelFor(processingReasonLabels, report.safe_reason)}</p>
								<code className="mt-1 block break-all font-mono text-[11px] text-foreground/70">
									{report.safe_reason}
								</code>
							</div>
						)}
					</div>
				</div>

				<div className="border-t border-border">
					<p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						Tentativas da IA
					</p>
					{report.attempt_logs.length === 0 ? (
						<p className="px-4 py-3 text-xs/relaxed text-muted-foreground">
							Nenhum registro detalhado de invocação foi armazenado.
						</p>
					) : (
						<ol
							aria-label="Tentativas da IA"
							className="divide-y divide-border"
						>
							{report.attempt_logs.map((attempt, index) => (
								<li className="grid gap-2 px-4 py-3" key={attempt.id}>
									<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
										<p className="text-xs font-medium text-foreground">
											Tentativa {index + 1} ·{" "}
											{attempt.success ? "Concluída" : "Falhou"}
										</p>
										<time
											className="text-[11px] text-muted-foreground"
											dateTime={new Date(attempt.created_at).toISOString()}
										>
											{dateFormatter.format(attempt.created_at)}
										</time>
									</div>
									<div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
										<span>Duração {formatDuration(attempt.duration_ms)}</span>
										{attempt.ttft_ms !== null && (
											<span>TTFT aprox. {formatDuration(attempt.ttft_ms)}</span>
										)}
										{attempt.total_tokens !== null && (
											<span>{attempt.total_tokens} tokens</span>
										)}
									</div>
									<code className="break-all font-mono text-[11px] text-foreground/70">
										{attempt.model}
									</code>
									{attempt.error_message && (
										<p className="border-l-2 border-destructive pl-3 text-xs/relaxed text-destructive">
											{attempt.error_message}
										</p>
									)}
								</li>
							))}
						</ol>
					)}
				</div>

				{orderedReviewTasks.length > 0 && (
					<div className="border-t border-border">
						<p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							Eventos de revisão
						</p>
						<ol
							aria-label="Eventos de revisão"
							className="divide-y divide-border"
						>
							{orderedReviewTasks.map((task) => (
								<li className="grid gap-1 px-4 py-3" key={task.event_id}>
									<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
										<p className="text-xs font-medium text-foreground">
											{labelFor(reviewKindLabels, task.kind)} ·{" "}
											{labelFor(reviewStatusLabels, task.status)}
										</p>
										<time
											className="text-[11px] text-muted-foreground"
											dateTime={new Date(task.updated_at).toISOString()}
										>
											{dateFormatter.format(task.updated_at)}
										</time>
									</div>
									<p className="text-xs/relaxed text-muted-foreground">
										{labelFor(processingReasonLabels, task.reason)}
									</p>
									<code className="break-all font-mono text-[11px] text-foreground/70">
										{task.reason}
									</code>
								</li>
							))}
						</ol>
					</div>
				)}
			</div>
		</section>
	);
}

function SupportMessageDialog({
	onOpenChange,
	reportId,
}: {
	onOpenChange: (open: boolean) => void;
	reportId: string | null;
}) {
	const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
	const queryClient = useQueryClient();
	const detail = useQuery({
		...adminSupportDetailQueryOptions(reportId ?? ""),
		enabled: Boolean(reportId),
	});
	const deleteReport = useMutation({
		mutationFn: async (id: string) => {
			const response = await fetch(`/api/admin/support/${id}`, {
				method: "DELETE",
			});
			if (!response.ok) throw new Error("Não foi possível excluir a mensagem.");
		},
		onSuccess: async (_, deletedReportId) => {
			setDeleteConfirmationOpen(false);
			onOpenChange(false);
			queryClient.removeQueries({
				queryKey: ["admin", "support", deletedReportId],
				exact: true,
			});
			await queryClient.invalidateQueries({
				queryKey: ["admin", "support"],
				exact: true,
			});
			toast.success("Mensagem excluída.");
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<>
			<Dialog onOpenChange={onOpenChange} open={Boolean(reportId)}>
				<DialogContent className="max-h-[min(760px,calc(100dvh-2rem))] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle className="pr-8 text-lg">
							Mensagem recebida
						</DialogTitle>
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
										O conteúdo desta mensagem expirou e não está mais
										disponível.
									</p>
								)}
							</div>

							<SupportProcessingLog report={detail.data} />

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
								<Button
									className="sm:ml-auto"
									onClick={() => setDeleteConfirmationOpen(true)}
									variant="destructive"
								>
									<Trash2 aria-hidden="true" />
									Excluir mensagem
								</Button>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>

			<AlertDialog
				onOpenChange={setDeleteConfirmationOpen}
				open={deleteConfirmationOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Excluir esta mensagem?</AlertDialogTitle>
						<AlertDialogDescription>
							A mensagem e os eventos de processamento associados serão
							excluídos permanentemente. Métricas anônimas de IA podem
							permanecer para auditoria. Uma issue já publicada no GitHub não
							será apagada.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteReport.isPending}>
							Cancelar
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteReport.isPending || !reportId}
							onClick={() => {
								if (reportId) deleteReport.mutate(reportId);
							}}
							variant="destructive"
						>
							{deleteReport.isPending
								? "Excluindo…"
								: "Excluir definitivamente"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
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
