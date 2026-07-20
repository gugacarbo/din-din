import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const typesPath = path.join(root, "src/worker-configuration.d.ts");
const fixturePath = path.join(root, "test/fixtures/wrangler-without-db.jsonc");
const before = readFileSync(typesPath, "utf8");
const fixture = readFileSync(fixturePath, "utf8");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
	pnpm,
	[
		"exec",
		"wrangler",
		"types",
		typesPath,
		"--config",
		fixturePath,
		"--include-runtime",
		"--include-env",
		"--check",
	],
	{ cwd: root, encoding: "utf8" },
);
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const after = readFileSync(typesPath, "utf8");

if (result.status === 0) {
	throw new Error(
		"A fixture sem o binding DB passou em `wrangler types --check`; o drift esperado não foi detectado.",
	);
}

if (!before.includes("DB: D1Database")) {
	throw new Error("O artefato versionado não declara o binding DB esperado.");
}

if (fixture.includes('"binding": "DB"')) {
	throw new Error("A fixture negativa ainda declara o binding DB.");
}

if (!/Types (at .* )?(are |is )?out of date/.test(output)) {
	throw new Error(
		`A fixture sem DB falhou por um motivo inesperado:\n${output || "(sem saída)"}`,
	);
}

if (before !== after) {
	throw new Error(
		"`wrangler types --check` alterou src/worker-configuration.d.ts durante a prova negativa.",
	);
}

console.log(
	"Prova negativa passou: remover o binding DB torna worker-configuration.d.ts desatualizado.",
);
