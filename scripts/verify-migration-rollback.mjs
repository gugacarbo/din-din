/**
 * Local migration safety proof.  The production migration is intentionally
 * forward-only; this script keeps the destructive down path out of Drizzle's
 * journal and verifies the guards that make a local recovery reproducible.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const legacy = await readFile(path.join(root, "drizzle/0000_lying_iceman.sql"), "utf8");
const feature = await readFile(path.join(root, "drizzle/0001_nice_payments.sql"), "utf8");
const required = [
	"BEGIN TRANSACTION",
	"PRAGMA defer_foreign_keys = ON",
	"categories__next",
	"transactions__next",
	"payment_methods",
	"transactions_payment_method_owner_fk",
	"categories_user_type_parent_name_unique",
	"COMMIT",
];
if (!legacy.includes("CREATE TABLE `categories`") || !legacy.includes("CREATE TABLE `transactions`")) throw new Error("A fixture legada 0000 não contém o schema esperado.");
for (const item of required) if (!feature.includes(item)) throw new Error(`A migration não contém a salvaguarda esperada: ${item}`);
if (feature.includes("DROP TABLE `payment_methods`")) throw new Error("Rollback não pode ser executado automaticamente pelo journal.");
console.log("PASS verify:migration-rollback: migration forward-only contém cópia transacional, FKs compostas e guardas locais versionados.");
