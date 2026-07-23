import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "#/components/ui/button.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

const schema = z.object({
	title: z.string().min(1).max(120),
	summary: z.string().min(1).max(800),
	observedBehavior: z.string().min(1).max(800),
});
type Values = z.infer<typeof schema>;

export function AdminSupportPublishDialog({ reportId }: { reportId: string }) {
	const queryClient = useQueryClient();
	const form = useForm<Values>({
		defaultValues: { title: "", summary: "", observedBehavior: "" },
		resolver: zodResolver(schema),
	});
	const publish = useMutation({
		mutationFn: async (value: Values) => {
			const response = await fetch(`/api/admin/support/${reportId}/publish`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					...value,
					technicalCategory: "bug",
					probableSteps: ["Reprodução validada pela administração"],
					technicalSignals: ["Relato revisado manualmente"],
					labels: ["bug"],
				}),
			});
			if (!response.ok) throw new Error("A publicação não foi concluída.");
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
			toast.success("Issue publicada.");
		},
		onError: (error) => toast.error(error.message),
	});
	return (
		<form
			className="grid gap-4"
			noValidate
			onSubmit={form.handleSubmit((value) => publish.mutate(value))}
		>
			<Field data-invalid={Boolean(form.formState.errors.title)}>
				<FieldLabel htmlFor="admin-title">Título público</FieldLabel>
				<Input
					aria-invalid={Boolean(form.formState.errors.title)}
					{...form.register("title")}
					id="admin-title"
				/>
				<FieldError errors={[form.formState.errors.title]} />
			</Field>
			<Field data-invalid={Boolean(form.formState.errors.summary)}>
				<FieldLabel htmlFor="admin-summary">Resumo público</FieldLabel>
				<Textarea
					aria-invalid={Boolean(form.formState.errors.summary)}
					{...form.register("summary")}
					id="admin-summary"
				/>
				<FieldError errors={[form.formState.errors.summary]} />
			</Field>
			<Field data-invalid={Boolean(form.formState.errors.observedBehavior)}>
				<FieldLabel htmlFor="admin-observed">
					Comportamento observado
				</FieldLabel>
				<Textarea
					aria-invalid={Boolean(form.formState.errors.observedBehavior)}
					{...form.register("observedBehavior")}
					id="admin-observed"
				/>
				<FieldError errors={[form.formState.errors.observedBehavior]} />
			</Field>
			<Button
				disabled={publish.isPending || form.formState.isSubmitting}
				type="submit"
			>
				Publicar issue
			</Button>
		</form>
	);
}
