import { Download, Plus, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog.tsx";

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isInstalledPwa() {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		(window.navigator as Navigator & { standalone?: boolean }).standalone ===
			true
	);
}

function isIosDevice() {
	return (
		/iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
		(window.navigator.platform === "MacIntel" &&
			window.navigator.maxTouchPoints > 1)
	);
}

export function PwaInstallButton() {
	const [installPrompt, setInstallPrompt] =
		useState<BeforeInstallPromptEvent | null>(null);
	const [isIos, setIsIos] = useState(false);
	const [iosInstallOpen, setIosInstallOpen] = useState(false);

	useEffect(() => {
		if (isInstalledPwa()) return;
		setIsIos(isIosDevice());

		function saveInstallPrompt(event: Event) {
			event.preventDefault();
			setInstallPrompt(event as BeforeInstallPromptEvent);
		}

		window.addEventListener("beforeinstallprompt", saveInstallPrompt);
		return () =>
			window.removeEventListener("beforeinstallprompt", saveInstallPrompt);
	}, []);

	async function install() {
		const currentInstallPrompt = installPrompt;
		if (!currentInstallPrompt) return;

		await currentInstallPrompt.prompt();
		setInstallPrompt(null);
	}

	if (!installPrompt && !isIos) return null;

	return (
		<Dialog onOpenChange={setIosInstallOpen} open={iosInstallOpen}>
			<Button
				onClick={() => {
					if (isIos) setIosInstallOpen(true);
					else void install();
				}}
				size="sm"
				variant="outline"
			>
				<Download />
				<span className="hidden sm:inline">Instalar app</span>
				<span className="sm:hidden">Instalar</span>
			</Button>
			{isIos && (
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Instalar o Din Din</DialogTitle>
						<DialogDescription>
							No iPhone e no iPad, a instalação é feita pelo menu do navegador:
						</DialogDescription>
					</DialogHeader>
					<ol className="grid gap-3 text-muted-foreground text-xs/relaxed">
						<li className="flex items-center gap-2">
							<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground">
								1
							</span>
							<span className="flex items-center gap-1.5">
								Toque em <Share aria-hidden="true" className="size-4" />
								Compartilhar.
							</span>
						</li>
						<li className="flex items-center gap-2">
							<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground">
								2
							</span>
							<span className="flex items-center gap-1.5">
								Selecione <Plus aria-hidden="true" className="size-4" />
								Adicionar à Tela de Início.
							</span>
						</li>
					</ol>
					<DialogFooter>
						<DialogClose render={<Button />}>Entendi</DialogClose>
					</DialogFooter>
				</DialogContent>
			)}
		</Dialog>
	);
}
