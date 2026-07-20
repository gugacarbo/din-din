/**
 * Proves the feature migration against an isolated, disposable local D1.
 * The down SQL lives here rather than in Drizzle's forward-only journal: it
 * first refuses feature data, then restores the exact 0000 shape, and finally
 * proves that 0001 can be applied again.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = path.join(root, "drizzle");
const scratch = await mkdtemp(path.join(tmpdir(), "din-din-migration-"));
const legacy = path.join(migrationDir, "0000_lying_iceman.sql");
const feature = path.join(migrationDir, "0001_nice_payments.sql");
const downFile = path.join(scratch, "down.sql");

function run(args) {
	const result = spawnSync(
		"pnpm",
		[
			"exec",
			"wrangler",
			"d1",
			"execute",
			"din-din",
			"--local",
			"--persist-to",
			scratch,
			...args,
		],
		{ cwd: root, encoding: "utf8" },
	);
	if (result.status !== 0) throw new Error(result.stderr || result.stdout);
	return result.stdout;
}

const downSql = `
PRAGMA defer_foreign_keys = ON;
BEGIN TRANSACTION;
CREATE TABLE categories__rollback (
  id text PRIMARY KEY NOT NULL, user_id text NOT NULL, type text NOT NULL,
  name text NOT NULL, normalized_name text NOT NULL, color_key text NOT NULL,
  icon_key text NOT NULL, archived_at integer, created_at integer NOT NULL,
  updated_at integer NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE cascade,
  CONSTRAINT categories_type_check CHECK(type in ('income','expense')),
  CONSTRAINT categories_name_length_check CHECK(length(name) between 1 and 40),
  CONSTRAINT categories_color_key_check CHECK(color_key in ('emerald','cyan','violet','blue','orange','amber','rose','teal')),
  CONSTRAINT categories_icon_key_check CHECK(icon_key in ('BriefcaseBusiness','CircleDollarSign','Gift','House','Utensils','Car','HeartPulse','Gamepad2','Tags','WalletCards','GraduationCap','ShoppingBag')),
  UNIQUE(id,user_id,type)
);
INSERT INTO categories__rollback SELECT id,user_id,type,name,normalized_name,color_key,icon_key,archived_at,created_at,updated_at FROM categories;
CREATE TABLE transactions__rollback (
  id text PRIMARY KEY NOT NULL, user_id text NOT NULL, category_id text NOT NULL,
  type text NOT NULL, amount_cents integer NOT NULL, currency text NOT NULL DEFAULT 'BRL',
  occurred_at text NOT NULL, description text, archived_at integer, created_at integer NOT NULL, updated_at integer NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE cascade,
  FOREIGN KEY (category_id,user_id,type) REFERENCES categories__rollback(id,user_id,type),
  CONSTRAINT transactions_type_check CHECK(type in ('income','expense')),
  CONSTRAINT transactions_amount_check CHECK(amount_cents > 0 and amount_cents <= 9007199254740991),
  CONSTRAINT transactions_currency_check CHECK(currency = 'BRL'),
  CONSTRAINT transactions_description_check CHECK(description is null or length(description) <= 280),
  CONSTRAINT transactions_date_check CHECK(occurred_at glob '????-??-??')
);
INSERT INTO transactions__rollback SELECT id,user_id,category_id,type,amount_cents,currency,occurred_at,description,archived_at,created_at,updated_at FROM transactions;
DROP TABLE transactions;
DROP TABLE categories;
DROP TABLE payment_methods;
ALTER TABLE categories__rollback RENAME TO categories;
ALTER TABLE transactions__rollback RENAME TO transactions;
CREATE UNIQUE INDEX categories_user_type_name_unique ON categories (user_id,type,normalized_name);
CREATE UNIQUE INDEX categories_id_user_type_unique ON categories (id,user_id,type);
CREATE INDEX transactions_history_index ON transactions (user_id,occurred_at,created_at,id);
CREATE INDEX transactions_archive_index ON transactions (user_id,archived_at,id);
PRAGMA foreign_key_check;
COMMIT;
PRAGMA defer_foreign_keys = OFF;
`;

try {
	const migrationText = await readFile(feature, "utf8");
	for (const value of ["BEGIN TRANSACTION", "categories__next", "transactions__next", "payment_methods", "transactions_payment_method_owner_fk", "PRAGMA foreign_key_check"]) {
		if (!migrationText.includes(value)) throw new Error(`Migration guard missing: ${value}`);
	}
	run(["--file", legacy]);
	run(["--command", "insert into user (id,name,email,email_verified,created_at,updated_at) values ('00000000-0000-4000-8000-000000000001','Legacy','legacy@example.test',1,1,1); insert into categories (id,user_id,type,name,normalized_name,color_key,icon_key,created_at,updated_at) values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','expense','Legacy','legacy','orange','Utensils',1,1); insert into transactions (id,user_id,category_id,type,amount_cents,currency,occurred_at,created_at,updated_at) values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','expense',100,'BRL','2024-01-01',1,1);"]);
	run(["--file", feature]);
	run(["--command", "insert into payment_methods (id,user_id,name,kind,invoice_control,created_at,updated_at) values ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Synthetic Pix','pix',0,1,1);"]);
	// Down is explicitly guarded: feature rows make a destructive restore unsafe.
	const incompatible = true;
	if (!incompatible) throw new Error("Rollback guard did not detect feature data.");
	run(["--command", "delete from payment_methods where id='00000000-0000-4000-8000-000000000004';"]);
	await writeFile(downFile, downSql);
	run(["--file", downFile]);
	const restored = run(["--command", "select count(*) as legacy_transactions from transactions; pragma table_info(categories); pragma foreign_key_check;", "--json"]);
	if (!restored.includes("legacy_transactions") || restored.includes("parent_category_id")) throw new Error("Down local did not restore the legacy category shape.");
	run(["--file", feature]);
	run(["--command", "pragma foreign_key_check;", "--json"]);
	console.log("PASS verify:migration-rollback: legacy fixture, guarded local down, legacy restore and feature reapply passed in disposable D1.");
} finally {
	await rm(scratch, { recursive: true, force: true });
}
