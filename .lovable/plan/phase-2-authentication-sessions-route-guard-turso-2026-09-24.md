# Phase 2 — Authentication, sessions, route guard (Turso)

Scope: sign-in only. Screens keep reading data from Supabase until Phase 3. Supabase code stays in place and unchanged in behaviour.

## Key point: both backends run side by side

Supabase's data security needs a signed-in Supabase user. If Phase 2 simply swapped sign-in to Turso, every screen would go empty until Phase 3. To avoid breaking the working app, a single server-only switch is added:

```text
APP_BACKEND=supabase   (default — app behaves exactly as today)
APP_BACKEND=turso      (sign-in, sign-up, sign-out, guard, password change use Turso)
```

The browser learns the mode from a small public server function (it returns only the word "supabase" or "turso", never credentials). In Phase 2 the `turso` mode is used to test sign-in; data screens in that mode will show empty until Phase 3. At Phase 7 the switch and the Supabase branch are removed.

## What gets built

**Database (new migration `0001_auth_sessions.sql`, additive only)**
- `sessions` table: id (random 256-bit, stored as SHA-256 hash), user_id, created_at, expires_at, revoked_at. Index on user_id and expires_at.
- Needed because a cookie alone cannot be "invalidated immediately" if copied; a server-side record can.

**Password hashing**
- PBKDF2-SHA256 via Web Crypto, 600,000 iterations, 16-byte random salt per user, stored as `pbkdf2$600000$salt$hash`. Constant-time comparison. Works on both Vercel and the preview runtime without native modules. Minimum length 6, same as the current form.

**Sessions (exactly 30 days, fixed)**
- Sign-in creates a `sessions` row with `expires_at = now + 30 days` and sets an encrypted, HTTP-only, `Secure`, `SameSite=Lax` cookie (TanStack Start `useSession`, keyed by `SESSION_SECRET`) holding only the session id, `maxAge` 30 days.
- Every check re-reads the row: missing, revoked, or past `expires_at` means signed out. The expiry is never extended (not sliding).
- Survives refresh and browser restart (persistent cookie). Nothing auth-related in localStorage.
- Tampered cookies fail decryption and are treated as signed out.

**Logout**
- Marks the session row revoked, then clears the cookie. A copied cookie is dead from that moment.
- Existing sign-out hygiene kept: cached screen data is cleared and the user is sent to `/auth` with history replace.

**First admin**
- Sign-up runs in one write transaction: create user, create profile, and if no admin exists yet, add the admin role. Later sign-ups create an account with no store access, same as today. Email uniqueness is case-insensitive.

**Server-side authorization (replaces RLS)**
- `requireUser()` and `requireAdmin()` helpers in `src/lib/auth.server.ts`, plus an `adminMiddleware` for server functions. Every protected server function from Phase 3 onward starts with it; unauthenticated calls get 401, non-admin 403. The route guard remains UX only.

**Server functions (`src/lib/auth.functions.ts`)**
`getBackendMode`, `getSessionUser`, `signUp`, `signIn`, `signOut`, `changePassword`. Zod-validated input; generic "Invalid email or password" on failure (no account enumeration).

**Password change / recovery (V1, no email)**
- Settings gets a small "Change password" card (current password, new password, confirm) styled with the existing card/input components. Changing the password revokes all other sessions.
- "Forgot password?" on the sign-in screen cannot work without email. In `turso` mode the link is replaced with the line "Forgot your password? Contact your system administrator." The `/reset-password` screen in `turso` mode redirects to `/auth`.
- For an owner who is locked out, a developer-only command `bun run admin:reset-password <email>` sets a new password directly against that store's database using its env vars, and revokes that user's sessions. Nothing is exposed on the web.

## UI changes (the only ones)
1. Settings: added "Change password" card.
2. Sign-in screen in `turso` mode: "Forgot password?" button replaced by the one-line note above.
Everything else — layout, copy, sign-up toggle, redirects to `/dashboard` and `/auth` — is unchanged.

## Files

Create: `turso/migrations/0001_auth_sessions.sql`, `src/lib/password.server.ts`, `src/lib/session.server.ts`, `src/lib/auth.server.ts`, `src/lib/auth.functions.ts`, `src/lib/backend-mode.ts` (client hook calling `getBackendMode`), `scripts/reset-password.ts`.

Modify: `src/routes/auth.tsx` (branch on mode), `src/routes/_authenticated/route.tsx` (guard + sign-out branch), `src/routes/reset-password.tsx` (redirect in turso mode), `src/routes/_authenticated/settings.tsx` (password card), `package.json` (`admin:reset-password` script), `.env.example` (`APP_BACKEND`), `TURSO-SETUP.md`, `roadmap.md`.

Untouched: all Supabase integration files, all other screens, all business logic.

## Testing

Run against a real libSQL server locally (and your test Turso database if you add it):
- migration 0001 applies cleanly on top of 0000, re-run is skipped
- first sign-up becomes admin; second sign-up has no admin role
- wrong password, unknown email, duplicate email (any case)
- session cookie is HTTP-only, Secure, 30-day max-age; survives a fresh browser context with the same cookie
- expiry: a session with `expires_at` in the past is rejected; expiry never moves on use
- logout: replaying the old cookie after logout is rejected
- tampered cookie rejected
- direct calls to protected server functions without a cookie get 401, as a non-admin get 403
- password change works, old password fails, other sessions revoked
- reset-password command works
- `APP_BACKEND=supabase`: app behaves exactly as today
- browser bundle and responses scanned for `TURSO_`, token and secret values

## Test environment

All Phase 2 testing uses a local libSQL server in this sandbox. No real Turso credentials are requested or added; your own test database is connected in the end-to-end testing phase. `APP_BACKEND` defaults to `supabase`, so the preview keeps working exactly as today. Phase 2 stops after the full report; Phase 3 waits for your approval.

## Remaining risks
- PBKDF2 at 600k iterations takes a noticeable fraction of a second per sign-in; acceptable for a POS, adjustable if slow.
- Mixed mode is temporary: in `turso` mode data screens are empty until Phase 3.
