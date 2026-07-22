import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { adminSupportQueryOptions } from "#/lib/admin-support-query-options.ts";

export function AdminSupportPage() {
	const reports = useQuery(adminSupportQueryOptions());
	if (reports.isPending) return <p>Carregando relatos…</p>;
	if (reports.error)
		return <p role="alert">Não foi possível carregar os relatos.</p>;
	return (
		<section>
			<h1 className="text-2xl font-semibold">Relatos de suporte</h1>
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
