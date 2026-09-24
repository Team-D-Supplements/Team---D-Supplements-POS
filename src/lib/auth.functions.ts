import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { getDb, withWriteTx, newId } from "./db.server";
import { hashPassword, verifyPassword, DUMMY_HASH } from "./password.server";
import { startSession, endSession, getCurrentUser, requireUser } from "./auth.server";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(6).max(200),
});

/** Validates login details; returns a readable message instead of raw validation output. */
const credentials = {
  parse(d: unknown) {
    const r = credentialsSchema.safeParse(d);
    if (!r.success) {
      const emailBad = r.error.issues.some((i) => i.path[0] === "email");
      throw new Error(
        emailBad ? "Please enter a valid email address" : "Password must be at least 6 characters",
      );
    }
    return r.data;
  },
};

export const getSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const u = await getCurrentUser();
  return u ? { id: u.id, email: u.email, isAdmin: u.isAdmin } : null;
});

/** Creates the account and signs in. First account on a clean database becomes admin. */
export const signUp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => credentials.parse(d))
  .handler(async ({ data }) => {
    const hash = await hashPassword(data.password);
    const id = newId();
    try {
      await withWriteTx(async (tx) => {
        await tx.execute({
          sql: "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
          args: [id, data.email, hash],
        });
        await tx.execute({ sql: "INSERT INTO profiles (id) VALUES (?)", args: [id] });
        await tx.execute({
          sql: `INSERT INTO user_roles (id, user_id, role)
                SELECT ?, ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE role = 'admin')`,
          args: [newId(), id],
        });
      });
    } catch (e) {
      if (e instanceof Error && /UNIQUE/i.test(e.message)) {
        setResponseStatus(409);
        throw new Error("An account with this email already exists");
      }
      throw e;
    }
    await startSession(id);
    return { ok: true };
  });

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => credentials.parse(d))
  .handler(async ({ data }) => {
    const r = await getDb().execute({
      sql: "SELECT id, password_hash FROM users WHERE email = ?",
      args: [data.email],
    });
    const row = r.rows[0];
    const ok = await verifyPassword(data.password, row ? String(row["password_hash"]) : DUMMY_HASH);
    if (!row || !ok) {
      setResponseStatus(401);
      throw new Error("Invalid email or password");
    }
    await startSession(String(row["id"]));
    return { ok: true };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await endSession();
  return { ok: true };
});

/** Signed-in password change. Revokes every other session of this user. */
export const changePassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z.string().min(6).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    const r = await getDb().execute({
      sql: "SELECT password_hash FROM users WHERE id = ?",
      args: [user.id],
    });
    const row = r.rows[0];
    if (!row || !(await verifyPassword(data.currentPassword, String(row["password_hash"])))) {
      setResponseStatus(400);
      throw new Error("Current password is incorrect");
    }
    const hash = await hashPassword(data.newPassword);
    await withWriteTx(async (tx) => {
      await tx.execute({
        sql: "UPDATE users SET password_hash = ? WHERE id = ?",
        args: [hash, user.id],
      });
      await tx.execute({
        sql: "UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND id <> ? AND revoked_at IS NULL",
        args: [user.id, user.sessionId],
      });
    });
    return { ok: true };
  });
