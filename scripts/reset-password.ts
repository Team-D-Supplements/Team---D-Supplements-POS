/**
 * DEVELOPER-ONLY. Never exposed through the web app.
 * Sets a new password for a user directly in the store's database and
 * revokes all of that user's sessions.
 *
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... bun run admin:reset-password owner@shop.com
 *
 * The new password is read from NEW_PASSWORD, or prompted for.
 */
import { createClient } from "@libsql/client";
import { hashPassword } from "../src/lib/password.server";

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.TURSO_DATABASE_URL;
if (!email || !url) {
  console.error(
    "Usage: TURSO_DATABASE_URL=... [TURSO_AUTH_TOKEN=...] bun run admin:reset-password <email>",
  );
  process.exit(1);
}
const password = process.env.NEW_PASSWORD ?? prompt("New password (min 6 chars):") ?? "";
if (password.length < 6) {
  console.error("Password must be at least 6 characters.");
  process.exit(1);
}

const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
const hash = await hashPassword(password);
const tx = await db.transaction("write");
try {
  const r = await tx.execute({
    sql: "UPDATE users SET password_hash = ? WHERE email = ?",
    args: [hash, email],
  });
  if (r.rowsAffected === 0) throw new Error(`No user with email ${email}`);
  await tx.execute({
    sql: "UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE email = ?)",
    args: [email],
  });
  await tx.commit();
  console.log(`Password updated for ${email}; all their sessions were signed out.`);
} catch (e) {
  await tx.rollback();
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  db.close();
}
