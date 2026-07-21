import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button.tsx";

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

export function PwaInstallButton() {
	const [installPrompt, setInstallPrompt] =
		useState<BeforeInstallPromptEvent | null>(null);

	useEffect(() => {
		if (isInstalledPwa()) return;

		function saveInstallPrompt(event: Event) {
			event.preventDefault();
			setInstallPrompt(event as BeforeInstallPromptEvent);
		}

		window.addEventListener("beforeinstallprompt", saveInstallPrompt);
		return () =>
			window.removeEventListener("beforeinstallprompt", saveInstallPrompt);
	}, []);

	if (!installPrompt) return null;

	async function install() {
		const currentInstallPrompt = installPrompt;
		if (!currentInstallPrompt) return;

		await currentInstallPrompt.prompt();
		setInstallPrompt(null);
	}

	return (
		<Button onClick={() => void install()} size="sm" variant="outline">
			<Download />
			<span className="hidden sm:inline">Instalar app</span>
			<span className="sm:hidden">Instalar</span>
		</Button>
	);
}
