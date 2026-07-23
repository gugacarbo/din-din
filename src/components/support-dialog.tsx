import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import html2canvas from "html2canvas";
import { Camera, CircleHelp, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog.tsx";
import { Field, FieldError, FieldLabel } from "#/components/ui/field.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import {
	type SupportInput,
	supportCategories,
	supportCategoryLabels,
	supportInputSchema,
} from "#/lib/support.ts";
import { supportDiagnosticsSnapshot } from "#/lib/support-diagnostics.ts";

const formSchema = supportInputSchema.pick({ category: true, message: true });
type FormValues = Pick<SupportInput, "category" | "message">;
type FrozenAttempt = {
	payload: string;
	screenshot: File | null;
};

function blobFromCanvas(
	canvas: HTMLCanvasElement,
	type: "image/png" | "image/webp",
) {
	return new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, type, type === "image/webp" ? 0.82 : undefined),
	);
}

export function SupportDialog({ offline }: { offline: boolean }) {
	const [open, setOpen] = useState(false);
	const [screenshot, setScreenshot] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const requestId = useRef(crypto.randomUUID());
	const frozenAttempt = useRef<FrozenAttempt | null>(null);
	const titleId = useId();
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { category: "problem", message: "" },
	});
	const submission = useMutation({
		mutationFn: async (values: FormValues) => {
			if (!frozenAttempt.current)
				frozenAttempt.current = {
					payload: JSON.stringify({
						...values,
						clientRequestId: requestId.current,
						diagnostics: supportDiagnosticsSnapshot(),
					} satisfies SupportInput),
					screenshot,
				};
			const body = new FormData();
			body.set("payload", frozenAttempt.current.payload);
			if (frozenAttempt.current.screenshot)
				body.set("screenshot", frozenAttempt.current.screenshot);
			let response: Response;
			try {
				response = await fetch("/api/support", { method: "POST", body });
			} catch {
				throw Object.assign(new Error("Não foi possível enviar."), {
					ambiguous: true,
				});
			}
			if (!response.ok) {
				const error = (await response
					.json()
					.catch(() => ({ message: "Não foi possível enviar." }))) as {
					message?: string;
				};
				throw Object.assign(
					new Error(error.message || "Não foi possível enviar."),
					{
						ambiguous: response.status >= 500,
					},
				);
			}
		},
		onSuccess: () => {
			toast.success("Recebemos sua mensagem");
			form.reset();
			setScreenshot(null);
			if (preview) URL.revokeObjectURL(preview);
			setPreview(null);
			requestId.current = crypto.randomUUID();
			frozenAttempt.current = null;
			setOpen(false);
		},
		onError: (error) => {
			toast.error(error.message);
			if (!(error as { ambiguous?: boolean }).ambiguous) {
				requestId.current = crypto.randomUUID();
				frozenAttempt.current = null;
			}
		},
	});
	function startNewAttempt() {
		requestId.current = crypto.randomUUID();
		frozenAttempt.current = null;
		submission.reset();
		form.clearErrors();
	}
	async function takeScreenshot() {
		try {
			document.documentElement.dataset.supportCapture = "true";
			await new Promise((resolve) => requestAnimationFrame(resolve));
			const canvas = await html2canvas(document.body, {
				backgroundColor: getComputedStyle(document.body).backgroundColor,
				width: window.innerWidth,
				height: window.innerHeight,
				scrollX: -window.scrollX,
				scrollY: -window.scrollY,
				windowWidth: window.innerWidth,
				windowHeight: window.innerHeight,
				ignoreElements: (element) =>
					element.closest(
						"[data-support-dialog], [data-support-capture-exclude]",
					) !== null,
			});
			const blob = await blobFromCanvas(canvas, "image/webp");
			if (!blob || blob.size > 2 * 1024 * 1024)
				throw new Error("O print ficou maior que 2 MiB.");
			if (preview) URL.revokeObjectURL(preview);
			setPreview(URL.createObjectURL(blob));
			setScreenshot(new File([blob], "suporte.webp", { type: "image/webp" }));
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Não foi possível tirar o print.",
			);
		} finally {
			delete document.documentElement.dataset.supportCapture;
		}
	}
	return (
		<Dialog
			onOpenChange={(next) => {
				setOpen(next);
			}}
			open={open}
		>
			<DialogTrigger asChild>
				<Button
					aria-label="Ajuda e suporte"
					size="icon"
					type="button"
					variant="ghost"
				>
					<CircleHelp />
					<span className="sr-only">Ajuda e suporte</span>
				</Button>
			</DialogTrigger>
			<DialogContent
				aria-labelledby={titleId}
				data-support-capture-exclude
				data-support-dialog
			>
				<DialogHeader>
					<DialogTitle id={titleId}>Ajuda e suporte</DialogTitle>
					<DialogDescription>
						Envie uma mensagem com dados técnicos limitados: até 50 logs e 50
						requests sem conteúdos, credenciais ou URLs com parâmetros.
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-4"
					onSubmit={form.handleSubmit((values) => submission.mutate(values))}
				>
					<Field
						data-invalid={Boolean(form.formState.errors.category) || undefined}
					>
						<FieldLabel>Categoria</FieldLabel>
						<Controller
							control={form.control}
							name="category"
							render={({ field }) => (
								<Select onValueChange={field.onChange} value={field.value}>
									<SelectTrigger
										aria-invalid={Boolean(form.formState.errors.category)}
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{supportCategories.map((category) => (
											<SelectItem key={category} value={category}>
												{supportCategoryLabels[category]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						/>
						<FieldError errors={[form.formState.errors.category]} />
					</Field>
					<Field
						data-invalid={Boolean(form.formState.errors.message) || undefined}
					>
						<FieldLabel htmlFor="support-message">Mensagem</FieldLabel>
						<Textarea
							aria-invalid={Boolean(form.formState.errors.message)}
							id="support-message"
							maxLength={4000}
							placeholder="Conte o que aconteceu e como podemos ajudar."
							{...form.register("message")}
						/>
						<FieldError errors={[form.formState.errors.message]} />
					</Field>
					<div className="grid gap-2">
						<Button
							disabled={submission.isPending || offline}
							onClick={takeScreenshot}
							type="button"
							variant="outline"
						>
							<Camera /> {screenshot ? "Tirar novamente" : "Tirar print"}
						</Button>
						{preview && (
							<div className="grid gap-2">
								<img
									alt="Preview do print de suporte"
									className="max-h-40 rounded border object-contain"
									src={preview}
								/>
								<Button
									onClick={() => {
										URL.revokeObjectURL(preview);
										setPreview(null);
										setScreenshot(null);
									}}
									type="button"
									variant="ghost"
								>
									<Trash2 /> Remover
								</Button>
							</div>
						)}
					</div>
					{submission.error && (
						<div className="grid gap-2">
							<p className="text-sm font-medium text-destructive" role="alert">
								{submission.error.message}
							</p>
							{(submission.error as { ambiguous?: boolean }).ambiguous && (
								<Button onClick={startNewAttempt} type="button" variant="ghost">
									Criar novo relato
								</Button>
							)}
						</div>
					)}
					<DialogFooter>
						<Button disabled={offline || submission.isPending} type="submit">
							{submission.isPending ? "Enviando…" : "Enviar mensagem"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
