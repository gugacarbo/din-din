import { spawnSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const allowedExamples = new Set([".env.example", ".dev.vars.example"]);
const forbiddenName =
  /(^|\/)(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?|[^/]*\.(?:pem|key|p12|pfx))$/i;
const privateKeyBlock =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]{128,}-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;

function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      result.stderr || "Não foi possível listar arquivos versionados.",
    );
  }
  return result.stdout.split("\0").filter(Boolean);
}

async function filesUnder(directory) {
  const files = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(directory);
  return files;
}

function isForbiddenPath(relative) {
  const normalized = relative.split(path.sep).join("/");
  return (
    forbiddenName.test(normalized) &&
    !allowedExamples.has(path.basename(normalized))
  );
}

async function containsPrivateKey(absolute) {
  let stats;
  try {
    stats = await lstat(absolute);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
  if (!stats.isFile() || stats.size > 10 * 1024 * 1024) return false;
  const contents = await readFile(absolute, "utf8");
  return privateKeyBlock.test(contents);
}

const tracked = trackedFiles();
const built = await filesUnder(dist);
const violations = new Set();

for (const relative of tracked) {
  if (isForbiddenPath(relative)) violations.add(relative);
  const absolute = path.join(root, relative);
  if (await containsPrivateKey(absolute)) violations.add(relative);
}

for (const absolute of built) {
  const relative = path.relative(root, absolute);
  if (isForbiddenPath(relative) || (await containsPrivateKey(absolute))) {
    violations.add(relative);
  }
}

if (violations.size > 0) {
  const paths = [...violations]
    .sort()
    .map((file) => `- ${file}`)
    .join("\n");
  throw new Error(`Artefatos sensíveis detectados:\n${paths}`);
}

console.log(
  `PASS verify:no-secret-artifacts: ${tracked.length} arquivos versionados e ${built.length} artefatos verificados.`,
);
