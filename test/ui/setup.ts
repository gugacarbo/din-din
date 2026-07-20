import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: query.includes("max-width"),
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
Object.assign(window, { ResizeObserver, PointerEvent: MouseEvent });
Object.assign(Element.prototype, { scrollIntoView: vi.fn() });
Object.assign(HTMLElement.prototype, {
	hasPointerCapture: vi.fn(() => false),
	releasePointerCapture: vi.fn(),
});
