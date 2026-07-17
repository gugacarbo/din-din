import { createAuthClient } from "better-auth/react";

// Auth shares the application's origin in production and local development.
export const authClient = createAuthClient();
