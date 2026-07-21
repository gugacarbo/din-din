import {
	type ConsoleDiagnostic,
	normaliseRequestPath,
	type RequestDiagnostic,
	safeValue,
} from "#/lib/support.ts";

const limit = 50;
const consoleEvents: ConsoleDiagnostic[] = [];
const requestEvents: RequestDiagnostic[] = [];
let installed = false;

function push<T>(buffer: T[], item: T) {
	buffer.push(item);
	if (buffer.length > limit) buffer.splice(0, buffer.length - limit);
}

function resultFor(
	response?: Response,
	error?: unknown,
): RequestDiagnostic["result"] {
	if (error instanceof DOMException && error.name === "AbortError")
		return "aborted";
	if (error) return "network_error";
	if (!response) return "unknown";
	return response.ok ? "success" : "http_error";
}

export function installSupportDiagnostics() {
	if (installed || typeof window === "undefined") return;
	installed = true;
	for (const level of ["debug", "info", "log", "warn", "error"] as const) {
		const native = console[level].bind(console);
		console[level] = (...args: unknown[]) => {
			try {
				push(consoleEvents, {
					at: Date.now(),
					level,
					args: args.map((arg) => safeValue(arg)),
				});
			} catch {
				// Diagnostics must never change console behaviour.
			}
			native(...args);
		};
	}
	const nativeFetch = window.fetch.bind(window);
	window.fetch = async (input, init) => {
		const at = Date.now();
		const request = input instanceof Request ? input : undefined;
		const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
		const url =
			typeof input === "string" || input instanceof URL
				? String(input)
				: input.url;
		try {
			const response = await nativeFetch(input, init);
			push(requestEvents, {
				at,
				method,
				path: normaliseRequestPath(url),
				status: response.status,
				durationMs: Date.now() - at,
				result: resultFor(response),
			});
			return response;
		} catch (error) {
			push(requestEvents, {
				at,
				method,
				path: normaliseRequestPath(url),
				durationMs: Date.now() - at,
				result: resultFor(undefined, error),
			});
			throw error;
		}
	};
	const open = XMLHttpRequest.prototype.open;
	const send = XMLHttpRequest.prototype.send;
	const methodKey = "__supportMethod";
	const pathKey = "__supportPath";
	XMLHttpRequest.prototype.open = function patchedOpen(
		method: string,
		url: string | URL,
		async?: boolean,
		username?: string | null,
		password?: string | null,
	) {
		Reflect.set(this, methodKey, String(method).toUpperCase());
		Reflect.set(this, pathKey, normaliseRequestPath(String(url)));
		return open.call(this, method, url, async ?? true, username, password);
	};
	XMLHttpRequest.prototype.send = function patchedSend(...args) {
		const at = Date.now();
		this.addEventListener(
			"loadend",
			() => {
				push(requestEvents, {
					at,
					method: Reflect.get(this, methodKey) || "GET",
					path: Reflect.get(this, pathKey) || "/[unknown]",
					status: this.status || undefined,
					durationMs: Date.now() - at,
					result: this.status
						? this.status >= 200 && this.status < 400
							? "success"
							: "http_error"
						: "network_error",
				});
			},
			{ once: true },
		);
		return send.call(this, ...args);
	};
}

export function supportDiagnosticsSnapshot() {
	return {
		console: [...consoleEvents],
		requests: [...requestEvents],
		route: `${window.location.pathname}`,
		viewport: { width: window.innerWidth, height: window.innerHeight },
		online: navigator.onLine,
		browser: navigator.userAgent.slice(0, 300),
		version: document.documentElement.dataset.buildVersion,
	};
}
