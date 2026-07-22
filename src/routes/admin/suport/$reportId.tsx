import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AdminSupportPublishDialog } from "#/components/admin-support-publish-dialog.tsx";

export const Route = createFileRoute("/admin/suport/$reportId")({
	component: ReportPage,
});

function ReportPage() {
	const { reportId } = Route.useParams();
	const report = useQuery({
		queryKey: ["admin", "support", reportId],
		queryFn: async () => {
			const response = await fetch(`/api/admin/support/${reportId}`);
			if (!response.ok) throw new Error("Relato indisponível.");
			return response.json() as Promise<{
				category: string;
				status: string;
				canManualPublish: boolean;
				unavailableReason: string | null;
			}>;
		},
	});
	if (report.isPending) return <p>Carregando relato…</p>;
	if (report.error) return <p role="alert">Relato indisponível.</p>;
	return (
		<section className="max-w-2xl">
			<h1 className="text-2xl font-semibold">Relato de suporte</h1>
			<p className="mt-2 text-muted-foreground">
				{report.data.category} · {report.data.status}
			</p>
			{report.data.canManualPublish ? (
				<div className="mt-6">
					<AdminSupportPublishDialog reportId={reportId} />
				</div>
			) : (
				<p className="mt-6" role="status">
					{report.data.unavailableReason === "private_payload_expired"
						? "O conteúdo privado expirou e não pode ser publicado."
						: "Este relato não pode mais ser publicado manualmente."}
				</p>
			)}
		</section>
	);
}
