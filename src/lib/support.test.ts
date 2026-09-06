import { describe, expect, it, vi } from "vitest";
import {
	maxDiagnosticsBytes,
	metadataFromDiagnostics,
	normaliseRequestPath,
	redactText,
	safeValue,
	serialiseDiagnostics,
	supportInputSchema,
} from "#/lib/support.ts";

describe("support privacy helpers", () => {
	it("redacts secret-shaped values and query strings", () => {
		expect(
			redactText(
				"Bearer ghp_abcdefghijklmnopqrstuvwxyz123456 https://example.test/path?token=private",
			),
		).not.toContain("ghp_");
		expect(redactText("https://example.test/path?token=private")).not.toContain(
			"private",
		);
	});
	it("fails closed for nested and cyclic form values", () => {
		const form: {
			email: string;
			card: string;
			comment: string;
			self?: unknown;
		} = {
			email: "alice@example.test",
			card: "4111111111111111",
			comment: "free form value",
		};
		form.self = form;
		expect(safeValue({ form, self: form })).toBe("[redacted]");
		const serialized = serialiseDiagnostics({
			console: [{ at: 1, level: "error", args: [form] }],
			requests: [
				{
					at: 2,
					method: "POST",
					path: "/transactions?form=private#fragment",
					durationMs: 1,
					result: "success",
				},
			],
			route: "/transactions?token=private#fragment",
			viewport: { width: 1280, height: 800 },
			online: true,
			browser: "browser free form value",
		});
		for (const value of [
			"alice@example.test",
			"4111111111111111",
			"free form value",
			"private",
			"fragment",
		])
			expect(serialized).not.toContain(value);
		expect(metadataFromDiagnostics(serialized)).toBe(
			'{"route":"/transactions","viewport":{"width":1280,"height":800},"online":true}',
		);
	});
	it("trims redacted text to 1_000 characters", () => {
		expect(redactText("y".repeat(1_200))).toHaveLength(1_000);
	});
	it("redacts gh prefix token shapes and JWT-like values", () => {
		for (const secret of ["ghp_"]) {
			expect(redactText(`header ${secret}abcdef0123`)).not.toContain(secret);
		}
		const jwt = "eyJhLWJjZGVmZy1uaWNlLXZhbHVl";
		expect(redactText(jwt)).not.toContain(jwt);
	});
	it("keeps harmless query-less urls and caps them safely", () => {
		expect(redactText("https://example.test/ok")).toBe(
			"https://example.test/ok",
		);
		expect(redactText("https://example.test/path?keep?nope&x=1#frag")).toBe(
			"https://example.test/[query-redacted]#frag",
		);
	});
	it("covers safeValue identity and fails-closed branches", () => {
		expect(safeValue(null)).toBeNull();
		expect(safeValue(true)).toBe(true);
		expect(safeValue(false)).toBe(false);
		expect(safeValue(undefined)).toBe("[redacted]");
		const error = new TypeError("oops oops");
		expect(safeValue(error)).toEqual({ name: "Error", message: "[redacted]" });
		expect(safeValue(42)).toBe("[redacted]");
		expect(safeValue(["x", 1, null, false])).toBe("[redacted]");
	});
	it("serializes console events with fallback levels, args limits and timestamps", () => {
		const many = Array.from({ length: 60 }, (_, at) => ({
			at: at + 1,
			level: "debug" as const,
			args: [true, null, undefined, "text", 7, { nested: 1 }, [1, undefined]],
		}));
		const serialized = serialiseDiagnostics({
			console: many,
			requests: [],
			route: "/ok",
			viewport: { width: 10, height: 20 },
			online: false,
			browser: "should-disappear",
		});
		const parsed = JSON.parse(serialized) as {
			console: Array<{ at: number; level: string; args: unknown[] }>;
		};
		expect(parsed.console).toHaveLength(50);
		expect(parsed.console[0]?.at).toBe(11);
		expect(parsed.console.at(-1)?.args).toEqual([
			true,
			null,
			"[redacted]",
			"[redacted]",
			"[redacted]",
			"[redacted]",
			"[redacted]",
		]);
	});
	it("normalizes bad console fields to safe defaults", () => {
		const consoleEvent: Record<string, unknown> = {
			at: Number.NaN,
			level: "trace",
			args: "not-an-array",
		};
		const badEvent: Record<string, unknown> = {
			at: Infinity,
			method: "fetch",
			path: "not a url at all",
			durationMs: Number.POSITIVE_INFINITY,
			result: "boom",
		};
		const goodPath: Record<string, unknown> = {
			at: 3,
			method: "get",
			path: "/deep?token=secret#f",
			status: 204,
			durationMs: -5,
			result: "network_error",
		};
		const serialized = serialiseDiagnostics({
			console: [consoleEvent as never],
			requests: [badEvent as never, goodPath as never],
			route: "not relative either",
			viewport: { width: 1, height: 2 },
			online: true,
			browser: "gone",
			version: "1.2.3",
		});
		expect(serialized).not.toContain("1.2.3");
		expect(serialized).toContain('"version":"[redacted]"');
		expect(serialized).not.toContain("not-an-array");
		const parsed = JSON.parse(serialized) as {
			console: Array<{ at: number; level: string; args: unknown[] }>;
			requests: Array<{
				at: number;
				method: string;
				path: string;
				status?: number;
				durationMs: number;
				result: string;
			}>;
		};
		expect(parsed.console[0]).toEqual({ at: 0, level: "log", args: [] });
		expect(parsed.requests[0]).toEqual({
			at: 0,
			method: "OTHER",
			path: "/not%20a%20url%20at%20all",
			durationMs: 0,
			result: "unknown",
		});
		expect(parsed.requests[1]?.method).toBe("GET");
		expect(parsed.requests[1]?.path).toBe("/deep");
		expect(parsed.requests[1]?.status).toBe(204);
		expect(parsed.requests[1]?.durationMs).toBe(-5);
		expect(parsed.requests[1]?.result).toBe("network_error");
	});
	it("drops the oldest mixed events deterministically until the budget fits", () => {
		const consoleEvents = Array.from({ length: 50 }, (_, at) => ({
			at: at + 1,
			level: "warn" as const,
			args: ["c".repeat(800)],
		}));
		const requestEvents = Array.from({ length: 50 }, (_, at) => ({
			at: at + 1,
			method: "POST",
			path: "/r",
			durationMs: 1,
			result: "success" as const,
		}));
		const serialized = serialiseDiagnostics({
			console: consoleEvents,
			requests: requestEvents,
			route: "/r",
			viewport: { width: 2, height: 3 },
			online: true,
			browser: "b",
			version: undefined,
		});
		expect(serialized).not.toContain("version");
		expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
			maxDiagnosticsBytes,
		);
		const parsed = JSON.parse(serialized) as {
			console: Array<{ at: number }>;
			requests: Array<{ at: number; status?: number }>;
		};
		expect(parsed.console.at(-1)?.at).toBe(50);
		expect(parsed.requests.at(-1)?.at).toBe(50);
		expect(parsed.requests.at(-1)?.status).toBeUndefined();
	});
	it("validates supportInputSchema success and failure branches", () => {
		const diagnostics = {
			console: [],
			requests: [],
			route: "/ok",
			viewport: { width: 800, height: 600 },
			online: true,
			browser: "chrome",
		};
		expect(
			supportInputSchema.safeParse({
				category: "suggestion",
				message: "olá",
				clientRequestId: "6f1c2b34-0000-4000-8000-000000000000",
				diagnostics: { ...diagnostics, version: "2.0.0" },
			}).success,
		).toBe(true);
		expect(
			supportInputSchema.parse({
				clientRequestId: "6f1c2b34-0000-4000-8000-000000000000",
				diagnostics,
				...{ category: "question" },
				message: "  spaced  ",
			}).message,
		).toBe("spaced");
		for (const broken of [
			{
				category: "other",
				clientRequestId: "6f1c2b34-0000-4000-8000-000000000000",
				message: "x",
				diagnostics,
			},
			{
				category: "problem",
				clientRequestId: "6f1c2b34-0000-4000-8000-000000000000",
				message: "   ",
				diagnostics,
			},
			{
				category: "problem",
				clientRequestId: "nope",
				message: "x",
				diagnostics,
			},
			{
				category: "problem",
				clientRequestId: "6f1c2b34-0000-4000-8000-000000000000",
				message: "x".repeat(4_001),
				diagnostics,
			},
			...(
				[
					{
						console: [],
						requests: [],
						route: "r".repeat(501),
						viewport: { width: 800, height: 600 },
						online: false,
						browser: "b",
					},
					{
						console: "nope",
						requests: [],
						route: "/",
						viewport: { width: 0, height: 600 },
						online: false,
						browser: "b",
					},
					{
						console: [],
						requests: [],
						route: "/",
						viewport: { width: 800, height: -1 },
						online: "no",
						browser: "b".repeat(301),
					},
				] as unknown[]
			).map((diagnosticsOverride) => ({
				category: "problem",
				clientRequestId: "6f1c2b34-0000-4000-8000-000000000000",
				message: "x",
				diagnostics: diagnosticsOverride,
			})),
			{
				category: "problem",
				clientRequestId: "6f1c2b34-0000-4000-8000-000000000000",
				message: "x",
				diagnostics: {
					...diagnostics,
					console: Array.from({ length: 51 }, (_, i) => ({
						at: i,
						level: "log" as const,
						args: [],
					})),
				},
			},
			{
				category: "problem",
				clientRequestId: "6f1c2b34-0000-4000-8000-000000000000",
				message: "x",
				diagnostics: {
					...diagnostics,
					requests: Array.from({ length: 51 }, (_, i) => ({
						at: i,
						method: "GET",
						path: "/",
						durationMs: 1,
						result: "success" as const,
					})),
				},
			},
		])
			expect(supportInputSchema.safeParse(broken).success).toBe(false);
		expect(supportInputSchema.safeParse({}).success).toBe(false);
	});
	it("extracts metadata from serialized diagnostics only", () => {
		const serialized = serialiseDiagnostics({
			console: [{ at: 1, level: "info", args: ["sensitive arg"] }],
			requests: [
				{
					at: 2,
					method: "GET",
					path: "/m",
					durationMs: 3,
					result: "http_error",
				},
			],
			route: "/m?token=secret",
			viewport: { width: 320, height: 240 },
			online: false,
			browser: "hidden",
		});
		expect(metadataFromDiagnostics(serialized)).toBe(
			'{"route":"/m","viewport":{"width":320,"height":240},"online":false}',
		);
	});
	it("handles diagnosticValue truncation and safe error serialization", () => {
		const err = new Error("test");
		const res = serialiseDiagnostics({
			console: [{ at: 1, level: "error", args: [err] }],
			requests: [],
			route: "/ok",
			viewport: { width: 1, height: 1 },
			online: true,
			browser: "b",
		});
		expect(res).toContain('"message":"[redacted]"');
	});

	it("normalizes request paths against the window origin and fails closed", () => {
		const origin = "https://app.example.test/with/base";
		vi.stubGlobal("window", { location: { origin } });
		try {
			expect(normaliseRequestPath("/cash")).toBe("/cash");
			expect(normaliseRequestPath("cash?amount=1")).toBe("/with/cash");
			expect(normaliseRequestPath("https://other.test/else")).toBe("/else");
		} finally {
			vi.unstubAllGlobals();
		}
	});
	it("redacts credential values in textual console arguments", () => {
		for (const [input, secret] of [
			[
				"Cookie: session=super-secret-cookie-value",
				"super-secret-cookie-value",
			],
			["Authorization: Basic dXNlcjpwYXNz", "dXNlcjpwYXNz"],
			["Authorization: Bearer super-secret-token", "super-secret-token"],
			["password=super-secret", "super-secret"],
		])
			expect(redactText(input)).not.toContain(secret);
		expect(safeValue("password=super-secret")).toBe("[redacted]");
	});
	it("keeps recent sanitized diagnostics within the aggregate byte budget", () => {
		const serialized = serialiseDiagnostics({
			console: Array.from({ length: 50 }, (_, at) => ({
				at,
				level: "error" as const,
				args: Array.from({ length: 20 }, () => "x".repeat(500)),
			})),
			requests: [],
			route: "/transactions",
			viewport: { width: 1280, height: 800 },
			online: true,
			browser: "test",
		});
		expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
			maxDiagnosticsBytes,
		);
		const diagnostics = JSON.parse(serialized) as {
			console: Array<{ at: number }>;
		};
		expect(diagnostics.console.at(-1)?.at).toBe(49);
	});
});
