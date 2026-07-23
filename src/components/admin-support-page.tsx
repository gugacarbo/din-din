import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GitHubIssueReference } from "#/components/github-issue-reference.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { adminSupportQueryOptions } from "#/lib/admin-support-query-options.ts";

export function AdminSupportPage() {
	const reports = useQuery(adminSupportQueryOptions());
	if (reports.isPending) return <p>Carregando relatos…</p>;
	if (reports.error)
		return <p role="alert">Não foi possível carregar os relatos.</p>;
	return (
		<section>
			<h1 className="text-2xl font-semibold text-foreground">
				Relatos de suporte
			</h1>
			<div className="mt-4 grid gap-3">
				{reports.data.items.map((report) => (
					<Card key={report.report_id}>
						<CardContent className="flex items-center justify-between p-4">
							<div>
								<p className="font-medium">{report.category}</p>
								<p className="text-sm text-muted-foreground">
									{report.status}
									{report.safe_reason ? ` · ${report.safe_reason}` : ""}
								</p>
								<p className="text-sm text-muted-foreground">
									Tentativas: {report.attempts}
								</p>
								<GitHubIssueReference
									issueNumber={report.issue_number}
									issueUrl={report.issue_url}
								/>
								{report.review_tasks.length > 0 && (
									<ul className="mt-1 text-sm text-muted-foreground">
										{report.review_tasks.map((task) => (
											<li key={task.event_id}>
												Revisão {task.kind}: {task.status} · {task.reason}
											</li>
										))}
									</ul>
								)}
							</div>
							<Link
								className="text-sm underline"
								params={{ reportId: report.report_id }}
								to="/admin/suport/$reportId"
							>
								Abrir
							</Link>
						</CardContent>
					</Card>
				))}
			</div>
		</section>
	);
}
