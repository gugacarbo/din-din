/**
 * Minimal Worker entrypoint for the D1 integration suite.
 *
 * The production config is still loaded for its D1 binding, but the suite
 * must not boot TanStack Start's production server entry. The finance service
 * is imported directly by the tests and runs in this same Worker isolate.
 */
export default {
	fetch() {
		return new Response("test worker");
	},
} satisfies ExportedHandler<Env>;
