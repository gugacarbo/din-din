import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { installMatchMedia, setViewportWidth } from "./viewport.ts";

installMatchMedia();
setViewportWidth(1024);

afterEach(() => {
	cleanup();
	setViewportWidth(1024);
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
