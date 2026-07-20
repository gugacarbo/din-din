import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const temporaryDirectory = mkdtempSync(
	path.join(root, "test/.wrangler-types-without-db-"),
);

try {
	const temporaryTypesPath = path.join(
		temporaryDirectory,
		"worker-configuration.d.ts",
	);
	const consumerPath = path.join(temporaryDirectory, "consumer.ts");
	const tsconfigPath = path.join(temporaryDirectory, "tsconfig.json");
	const envImportPath = path
		.relative(temporaryDirectory, path.join(root, "src/env.ts"))
		.replaceAll("\\\\", "/");
	const relativeEnvImport = envImportPath.startsWith(".")
		? envImportPath
		: `./${envImportPath}`;

	const generateTypesResult = spawnSync(
		pnpm,
		[
			"exec",
			"wrangler",
			"types",
			temporaryTypesPath,
			"--config",
			fixturePath,
			"--include-runtime",
			"--include-env",
		],
		{ cwd: root, encoding: "utf8" },
	);
	const generateTypesOutput = `${generateTypesResult.stdout ?? ""}${generateTypesResult.stderr ?? ""}`;

	if (generateTypesResult.status !== 0) {
		throw new Error(
			`Não foi possível gerar o contrato temporário sem DB:\n${generateTypesOutput || "(sem saída)"}`,
		);
	}

	writeFileSync(
		consumerPath,
		`import { database } from "${relativeEnvImport}";\n\nvoid database;\n`,
	);
	writeFileSync(
		tsconfigPath,
		JSON.stringify(
			{
				compilerOptions: {
					target: "ES2022",
					module: "ESNext",
					moduleResolution: "bundler",
					lib: ["ES2022", "DOM", "DOM.Iterable"],
					strict: true,
					skipLibCheck: true,
					noEmit: true,
					allowImportingTsExtensions: true,
					verbatimModuleSyntax: true,
				},
				files: [temporaryTypesPath, path.join(root, "src/env.ts"), consumerPath],
			},
			null,
			2,
		),
	);

	const typecheckResult = spawnSync(
		pnpm,
		["exec", "tsc", "--project", tsconfigPath],
		{ cwd: root, encoding: "utf8" },
	);
	const typecheckOutput = `${typecheckResult.stdout ?? ""}${typecheckResult.stderr ?? ""}`;

	if (typecheckResult.status === 0) {
		throw new Error(
			"O consumidor compilou contra um Env temporário sem DB; o contrato gerado não está sendo aplicado.",
		);
	}

	if (!/Property ['\"]DB['\"] does not exist on type ['\"]Env['\"]/.test(typecheckOutput)) {
		throw new Error(
			`O consumidor falhou por um motivo inesperado, não pela ausência do DB:\n${typecheckOutput || "(sem saída)"}`,
		);
	}
} finally {
	rmSync(temporaryDirectory, { force: true, recursive: true });
}

console.log(
	"Prova negativa passou: remover o binding DB causa drift e impede o typecheck do consumidor.",
);
