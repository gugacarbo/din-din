type MediaListener = (event: MediaQueryListEvent) => void;

const listeners = new Map<string, Set<MediaListener>>();

function matches(query: string) {
	const maxWidth = query.match(/max-width:\s*(\d+)px/);
	if (maxWidth && window.innerWidth > Number(maxWidth[1])) return false;
	const minWidth = query.match(/min-width:\s*(\d+)px/);
	if (minWidth && window.innerWidth < Number(minWidth[1])) return false;
	return Boolean(maxWidth || minWidth);
}

export function installMatchMedia() {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		writable: true,
		value: vi.fn((query: string): MediaQueryList => ({
			matches: matches(query),
			media: query,
			onchange: null,
			addEventListener: (_type, listener) => {
				const callbacks = listeners.get(query) ?? new Set<MediaListener>();
				callbacks.add(listener as MediaListener);
				listeners.set(query, callbacks);
			},
			removeEventListener: (_type, listener) => {
				listeners.get(query)?.delete(listener as MediaListener);
			},
			addListener: (listener) => {
				const callbacks = listeners.get(query) ?? new Set<MediaListener>();
				callbacks.add(listener);
				listeners.set(query, callbacks);
			},
			removeListener: (listener) => listeners.get(query)?.delete(listener),
			dispatchEvent: () => true,
		})),
	});
}

export function setViewportWidth(width: number) {
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		value: width,
	});
	window.dispatchEvent(new Event("resize"));
	for (const [query, callbacks] of listeners)
		for (const callback of callbacks)
			callback(
				new MediaQueryListEvent("change", {
					matches: matches(query),
					media: query,
				}),
			);
}
import { vi } from "vitest";
