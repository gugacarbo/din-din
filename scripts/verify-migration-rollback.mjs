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
const support = path.join(migrationDir, "0004_support_reports.sql");
const supportLeases = path.join(migrationDir, "0005_support_report_leases.sql");
const supportReservations = path.join(migrationDir, "0006_support_publication_reservations.sql");
const aiLogging = path.join(migrationDir, "0007_ai_usage_logging.sql");
const admin = path.join(migrationDir, "0008_admin_support_review.sql");
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

function assertSafeToDown() {
	const output = run([
		"--command",
		"select case when exists(select 1 from payment_methods) or exists(select 1 from categories where parent_category_id is not null) or exists(select 1 from transactions where payment_method_id is not null or invoice_cycle_closing_date is not null or invoice_cycle_due_date is not null) then 1 else 0 end as incompatible_feature_data;",
		"--json",
	]);
	if (/"incompatible_feature_data"\s*:\s*1/.test(output)) {
		throw new Error(
			"Rollback recusado: dados da feature precisam ser removidos antes do down local.",
		);
	}
}

function assertSafeToRemoveSupport() {
	const output = run([
		"--command",
		"select case when exists(select 1 from support_reports) or exists(select 1 from support_report_payloads) or exists(select 1 from support_review_tasks) then 1 else 0 end as support_data_present;",
		"--json",
	]);
	if (/"support_data_present"\s*:\s*1/.test(output)) throw new Error("Support rollback recusado: remova report, payload e task antes do down local.");
}

const supportDownSql = `
DROP TRIGGER IF EXISTS support_payload_rate_limit;
DROP TABLE IF EXISTS support_review_tasks;
DROP TABLE IF EXISTS support_report_payloads;
DROP TABLE IF EXISTS support_reports;
`;
const adminDownSql = `
DROP TABLE IF EXISTS support_manual_publications;
DROP TABLE IF EXISTS admin_invite_continuations;
DROP TABLE IF EXISTS admin_invites;
DROP TABLE IF EXISTS admin_memberships;
`;

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
	for (const value of ["PRAGMA defer_foreign_keys = ON", "categories__next", "transactions__next", "payment_methods", "transactions_payment_method_owner_fk", "PRAGMA foreign_key_check"]) {
		if (!migrationText.includes(value)) throw new Error(`Migration guard missing: ${value}`);
	}
	run(["--file", legacy]);
	run(["--command", "insert into user (id,name,email,email_verified,created_at,updated_at) values ('00000000-0000-4000-8000-000000000001','Legacy','legacy@example.test',1,1,1); insert into categories (id,user_id,type,name,normalized_name,color_key,icon_key,created_at,updated_at) values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','expense','Legacy','legacy','orange','Utensils',1,1); insert into transactions (id,user_id,category_id,type,amount_cents,currency,occurred_at,created_at,updated_at) values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','expense',100,'BRL','2024-01-01',1,1);"]);
	run(["--file", feature]);
	run(["--file", support]);
	run(["--file", supportLeases]);
	run(["--file", supportReservations]);
	run(["--file", aiLogging]);
	run(["--file", admin]);
	const adminInvite = "00000000-0000-4000-8000-000000000007";
	run(["--command", `insert into admin_invites (invite_id,token_hmac,email_normalized,expires_at,created_at) values ('${adminInvite}','hmac','admin@example.test',2,1); insert into admin_memberships (user_id,created_at,created_by_invite_id) values ('00000000-0000-4000-8000-000000000001',1,'${adminInvite}');`]);
	let adminRefused = false;
	try { run(["--command", "select case when exists(select 1 from admin_memberships) or exists(select 1 from admin_invites) then raise(abort, 'admin data present') end;"]); } catch { adminRefused = true; }
	if (!adminRefused) throw new Error("Admin rollback guard did not refuse administrative data.");
	run(["--command", `delete from admin_memberships; delete from admin_invites where invite_id='${adminInvite}';`]);
	await writeFile(downFile, adminDownSql);
	run(["--file", downFile]);
	const adminRemoved = run(["--command", "select count(*) as admin_tables from sqlite_master where type='table' and name like 'admin_%';", "--json"]);
	if (!/"admin_tables"\s*:\s*0/.test(adminRemoved)) throw new Error("Admin down did not remove every admin table.");
	run(["--file", admin]);
	const supportReport = "00000000-0000-4000-8000-000000000005";
	run(["--command", `insert into support_reports (report_id,category,status,attempts,created_at,updated_at) values ('${supportReport}','problem','queued',0,1,1); insert into support_report_payloads (report_id,user_id,client_request_id,fingerprint,message,diagnostics,metadata,received_at,expires_at) values ('${supportReport}','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000006','fingerprint','private message','{}','{}',1,2); insert into support_review_tasks (event_id,report_id,kind,reason,status,created_at,updated_at) values ('manual:${supportReport}','${supportReport}','manual_review','test','pending',1,1);`]);
	let supportRefused = false;
	try { assertSafeToRemoveSupport(); } catch (error) { supportRefused = error instanceof Error && error.message.startsWith("Support rollback recusado:"); }
	if (!supportRefused) throw new Error("Support rollback guard did not refuse private support data.");
	run(["--command", `delete from support_review_tasks where report_id='${supportReport}'; delete from support_report_payloads where report_id='${supportReport}'; delete from support_reports where report_id='${supportReport}';`]);
	assertSafeToRemoveSupport();
	await writeFile(downFile, supportDownSql);
	run(["--file", downFile]);
	const supportRemoved = run(["--command", "select count(*) as support_tables from sqlite_master where type='table' and name in ('support_reports','support_report_payloads','support_review_tasks');", "--json"]);
	if (!/"support_tables"\s*:\s*0/.test(supportRemoved)) throw new Error("Support down did not remove every support table.");
	run(["--file", support]);
	run(["--file", supportLeases]);
	run(["--file", supportReservations]);
	run(["--command", "pragma foreign_key_check;", "--json"]);
	run(["--command", "insert into payment_methods (id,user_id,name,kind,invoice_control,created_at,updated_at) values ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','Synthetic Pix','pix',0,1,1);"]);
	let refused = false;
	try {
		assertSafeToDown();
	} catch (error) {
		refused = error instanceof Error && error.message.startsWith("Rollback recusado:");
	}
	if (!refused) throw new Error("Rollback guard did not refuse incompatible feature data.");
	run(["--command", "delete from payment_methods where id='00000000-0000-4000-8000-000000000004';"]);
	assertSafeToDown();
	await writeFile(downFile, downSql);
	run(["--file", downFile]);
	const restored = run(["--command", "select count(*) as legacy_transactions from transactions; pragma table_info(categories); pragma foreign_key_check;", "--json"]);
	if (!restored.includes("legacy_transactions") || restored.includes("parent_category_id")) throw new Error("Down local did not restore the legacy category shape.");
	run(["--file", feature]);
	run(["--command", "pragma foreign_key_check;", "--json"]);
	console.log("PASS verify:migration-rollback: legacy fixture, guarded support and feature down, private-table removal, legacy restore and reapply passed in disposable D1.");
} finally {
	await rm(scratch, { recursive: true, force: true });
}
