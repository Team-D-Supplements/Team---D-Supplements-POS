// Server-only authentication + authorization for the Turso backend.
import { useSession, setResponseStatus } from "@tanstack/react-start/server";
import { getDb } from "./db.server";

export const SESSION_DAYS = 30;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;

function sessionConfig() {
  const password = process.env["SESSION_SECRET"];
  if (!password || password.length < 32) {
    console.error("[auth] SESSION_SECRET missing or shorter than 32 characters");
    throw new Error("Authentication is not configured");
  }
  return {
    password,
    name: "supppos_session",
    maxAge: SESSION_SECONDS,
    sessionHeader: false as const, // cookie only — never accept a session from a header
    cookie: {
      httpOnly: true,
      secure: true,
      // SameSite=None + Partitioned (CHIPS) so the session cookie survives when the
      // app is rendered inside an embedded preview frame. Partitioned keeps it scoped
      // to the embedding site, so it is not a general third-party cookie.
      sameSite: "none" as const,
      partitioned: true,
      path: "/",
      maxAge: SESSION_SECONDS,
    },
  };
}

type SessionData = { token?: string };

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Creates a fixed 30-day session row and writes the encrypted cookie. */
export async function startSession(userId: string) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await getDb().execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    args: [await sha256Hex(token), userId, expires],
  });
  const session = await useSession<SessionData>(sessionConfig());
  await session.update({ token });
  // Housekeeping on sign-in: remove expired/revoked session rows (a missing row is rejected
  // exactly like a revoked one, so this never re-enables a session). Never blocks sign-in.
  await getDb()
    .execute(
      "DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now') OR revoked_at IS NOT NULL",
    )
    .catch(() => undefined);
}

/** Revokes the current session server-side and clears the cookie. */
export async function endSession() {
  const session = await useSession<SessionData>(sessionConfig());
  const token = session.data.token;
  if (token) {
    await getDb().execute({
      sql: "UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND revoked_at IS NULL",
      args: [await sha256Hex(token)],
    });
  }
  await session.clear();
}

export type AuthUser = { id: string; email: string; isAdmin: boolean; sessionId: string };

/** Returns the signed-in user, or null. Expiry is fixed — never extended. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  let token: string | undefined;
  try {
    const session = await useSession<SessionData>(sessionConfig());
    token = session.data.token;
  } catch {
    return null; // tampered / undecryptable cookie
  }
  if (!token) return null;
  const sid = await sha256Hex(token);
  const r = await getDb().execute({
    sql: `SELECT u.id, u.email,
            EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin') AS is_admin
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND s.revoked_at IS NULL
            AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    args: [sid],
  });
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row["id"]),
    email: String(row["email"]),
    isAdmin: Number(row["is_admin"]) === 1,
    sessionId: sid,
  };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    setResponseStatus(401);
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isAdmin) {
    setResponseStatus(403);
    throw new Error("Not authorised");
  }
  return user;
}
