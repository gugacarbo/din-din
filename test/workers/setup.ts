import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

/**
 * Applies all Drizzle-generated D1 migrations to the ephemeral `env.DB`
 * provided by the Workers Vitest pool before any test scenario runs.
 *
 * This setup file runs inside the Workers runtime and has access to the
 * `TEST_MIGRATIONS` binding declared in `vitest.workers.config.ts`.
 */
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);