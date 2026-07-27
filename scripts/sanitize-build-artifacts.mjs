import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedSecretsFile = path.join(root, "dist", "server", ".dev.vars");

// The Cloudflare Vite build may copy local development variables into the
// server output. They are not needed by the deployed Worker, so remove only
// this exact generated path before any artifact inspection or upload.
await rm(generatedSecretsFile, { force: true });

console.log(
  "PASS sanitize-build-artifacts: removed generated local secrets file.",
);
