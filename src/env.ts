import { z } from "zod";

const runtimeSchema = z.object({
	BETTER_AUTH_SECRET: z.string().min(32),
	BETTER_AUTH_URL: z.string().url(),
	DB: z.custom<D1Database>(),
	GOOGLE_CLIENT_ID: z.string().min(1),
	GOOGLE_CLIENT_SECRET: z.string().min(1),
});

export type RuntimeEnv = z.infer<typeof runtimeSchema>;

export function getRuntimeEnv(value: unknown): RuntimeEnv {
	return runtimeSchema.parse(value);
}
