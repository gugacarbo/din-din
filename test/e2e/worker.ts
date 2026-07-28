/** Minimal Worker harness for E2E tests that exercise remote bindings only. */
export default {
	fetch() {
		return new Response("ok");
	},
} satisfies ExportedHandler<Env>;
