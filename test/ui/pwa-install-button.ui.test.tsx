import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PwaInstallButton } from "#/components/pwa-install-button.tsx";

function dispatchInstallPrompt(prompt = vi.fn().mockResolvedValue(undefined)) {
	const event = new Event("beforeinstallprompt", { cancelable: true });
	Object.assign(event, {
		prompt,
		userChoice: Promise.resolve({ outcome: "accepted" }),
	});
	window.dispatchEvent(event);
	return { event, prompt };
}

describe("PwaInstallButton", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("is hidden until the browser offers installation", () => {
		render(<PwaInstallButton />);

		expect(screen.queryByRole("button", { name: /instalar/i })).not.toBeInTheDocument();
	});

	it("opens the native install prompt when installation is available", async () => {
		render(<PwaInstallButton />);
		const { event, prompt } = dispatchInstallPrompt();

		const button = await screen.findByRole("button", { name: /instalar/i });
		expect(event.defaultPrevented).toBe(true);

		fireEvent.click(button);

		expect(prompt).toHaveBeenCalledOnce();
		await waitFor(() =>
			expect(
				screen.queryByRole("button", { name: /instalar/i }),
			).not.toBeInTheDocument(),
		);
	});

	it("stays hidden when the PWA is already installed", () => {
		vi.mocked(window.matchMedia).mockReturnValue({
			matches: true,
			media: "(display-mode: standalone)",
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		} as unknown as MediaQueryList);

		render(<PwaInstallButton />);
		dispatchInstallPrompt();

		expect(screen.queryByRole("button", { name: /instalar/i })).not.toBeInTheDocument();
	});

	it("shows iPhone installation instructions when iOS cannot open a native prompt", async () => {
		vi.mocked(window.matchMedia).mockReturnValue({
			matches: false,
		} as MediaQueryList);
		vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
		);

		render(<PwaInstallButton />);

		const button = await screen.findByRole("button", { name: /instalar/i });
		fireEvent.click(button);

		expect(screen.getByRole("dialog")).toHaveTextContent(
			"Adicionar à Tela de Início",
		);
	});
});
