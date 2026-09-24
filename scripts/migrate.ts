/**
 * Applies turso/migrations/*.sql, in filename order, to the database named by
 * TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN). Already-applied files are skipped,
 * tracked in the _migrations table, so it is safe to run repeatedly.
 *
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... bun run db:migrate
 *
 * Works for a local file too: TURSO_DATABASE_URL=file:local.db bun run db:migrate
 */
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
if (!url) {
  console.error("TURSO_DATABASE_URL is not set. See .env.example.");
  process.exit(1);
}

const dir = join(import.meta.dirname ?? process.cwd(), "..", "turso", "migrations");
const db = createClient({ url, authToken });

async function main() {
  await db.execute("PRAGMA foreign_keys = ON");
  await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);

  const applied = new Map(
    (await db.execute("SELECT name, checksum FROM _migrations")).rows.map((r) => [
      String(r.name),
      String(r.checksum),
    ]),
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let ran = 0;
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prev = applied.get(file);
    if (prev) {
      if (prev !== checksum) {
        throw new Error(`${file} was changed after being applied. Add a new migration instead.`);
      }
      continue;
    }
    // executeMultiple runs the whole file; wrap it so a failure leaves nothing behind.
    await db
      .executeMultiple(
        `BEGIN;\n${sql}\nINSERT INTO _migrations(name, checksum) VALUES ('${file}', '${checksum}');\nCOMMIT;`,
      )
      .catch(async (e) => {
        await db.execute("ROLLBACK").catch(() => {});
        throw new Error(`${file} failed: ${e instanceof Error ? e.message : e}`);
      });
    console.log(`applied ${file}`);
    ran++;
  }
  console.log(ran ? `${ran} migration(s) applied.` : "Database already up to date.");
}

main()
  .then(() => db.close())
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    db.close();
    process.exit(1);
  });
