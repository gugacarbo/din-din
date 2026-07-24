import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const diagnostics = vi.hoisted(() => ({ snapshot: vi.fn() }));
const canvas = vi.hoisted(() => vi.fn());

vi.mock("#/lib/support-diagnostics.ts", () => ({
	supportDiagnosticsSnapshot: diagnostics.snapshot,
}));
vi.mock("html-to-image", () => ({ toCanvas: canvas }));

import { SupportDialog } from "#/components/support-dialog.tsx";

function renderDialog() {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<SupportDialog offline={false} />
		</QueryClientProvider>,
	);
}

async function openDialog() {
	await userEvent.setup().click(
		screen.getByRole("button", { name: "Ajuda e suporte" }),
	);
	return screen.findByRole("dialog");
}

describe("SupportDialog", () => {
	beforeEach(() => {
		diagnostics.snapshot.mockReset();
		diagnostics.snapshot.mockReturnValue({
			console: [],
			requests: [],
			route: "/transactions",
			viewport: { width: 1280, height: 800 },
			online: true,
			browser: "test",
		});
		canvas.mockReset();
		vi.stubGlobal("fetch", vi.fn());
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: vi.fn(() => "blob:support-preview"),
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			value: vi.fn(),
		});
		Object.defineProperties(window, {
			scrollX: { configurable: true, value: 0 },
			scrollY: { configurable: true, value: 0 },
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("reuses the exact diagnostic payload for an ambiguous retry", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ message: "Tente novamente." }, { status: 500 }))
			.mockResolvedValueOnce(Response.json({ reportId: "report-1" }));
		vi.stubGlobal("fetch", fetcher);
		const user = userEvent.setup();
		renderDialog();
		await openDialog();
		await user.type(
			screen.getByLabelText("Mensagem"),
			"O lançamento não foi salvo.",
		);
		await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));
		await screen.findByRole("alert");
		await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));
		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

		const payloads = fetcher.mock.calls.map(([, init]) =>
			(init?.body as FormData).get("payload"),
		);
		expect(payloads[1]).toBe(payloads[0]);
		expect(diagnostics.snapshot).toHaveBeenCalledTimes(1);
	});

	it("excludes the dialog and every marked element from the viewport capture", async () => {
		Object.defineProperties(window, {
			scrollX: { configurable: true, value: 320 },
			scrollY: { configurable: true, value: 180 },
		});
		canvas.mockResolvedValue({
			toBlob(callback: BlobCallback) {
				callback(new Blob(["screenshot"], { type: "image/webp" }));
			},
		});
		renderDialog();
		const dialog = await openDialog();
		fireEvent.click(screen.getByRole("button", { name: "Tirar print" }));
		await waitFor(() => expect(canvas).toHaveBeenCalledTimes(1));
		expect(
			await screen.findByAltText("Preview do print de suporte"),
		).toBeVisible();

		const options = canvas.mock.calls[0][1] as {
			filter: (element: HTMLElement) => boolean;
		};
		const excluded = document.createElement("div");
		excluded.dataset.supportCaptureExclude = "";
		const overlay = document.createElement("div");
		overlay.dataset.slot = "dialog-overlay";
		const externalImage = document.createElement("img");
		externalImage.src = "https://lh3.googleusercontent.com/avatar";
		const localImage = document.createElement("img");
		localImage.src = "/avatar.png";
		expect(options.filter(dialog)).toBe(false);
		expect(options.filter(excluded)).toBe(false);
		expect(options.filter(overlay)).toBe(false);
		expect(options.filter(externalImage)).toBe(false);
		expect(options.filter(localImage)).toBe(true);
		expect(options.filter(document.createElement("main"))).toBe(true);
		expect(
			options.filter(
				document.createTextNode("conteúdo") as unknown as HTMLElement,
			),
		).toBe(true);
		expect(canvas.mock.calls[0][1]).toMatchObject({
			canvasHeight: window.innerHeight,
			canvasWidth: window.innerWidth,
			height: window.innerHeight,
			imagePlaceholder: expect.stringMatching(/^data:image\/gif;base64,/),
			onImageErrorHandler: expect.any(Function),
			pixelRatio: 1,
			style: {
				transform: "translate(-320px, -180px)",
				transformOrigin: "top left",
			},
			width: window.innerWidth,
		});
	});
});
