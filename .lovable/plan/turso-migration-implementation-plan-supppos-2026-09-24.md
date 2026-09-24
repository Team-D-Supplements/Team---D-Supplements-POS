# Turso migration — implementation plan (SuppPOS)

Planning only. Nothing is changed, removed or deployed until you approve. UI, screens, navigation, workflows, calculations, printing, sharing and PWA behaviour stay exactly as they are; only the data/auth layer underneath changes.

## 1. Target architecture

```text
Browser (unchanged React UI)
   -> TanStack Start server functions  (session check -> admin check -> validate -> SQL)
      -> Turso / libSQL  (server-only credentials)
```

Every screen keeps React Query; only the `queryFn` changes from `supabase.from(...)` to a server function call. Turso is reached solely through `src/lib/db.server.ts`, which reads `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` inside the handler. `.server.ts` files are blocked from browser bundles, so no token can reach the client. No new service, no microservices, no tenant_id.

## 2. Generic, reusable codebase

No client data, credentials, URLs, tokens or shop details anywhere in source. Everything client-specific lives in environment variables plus first-run setup inside the app (first sign-up becomes admin; shop details entered on the Settings screen). The same commit deploys for you, Client A, Client B — only env vars and the Turso database differ. Only seeded row: the default `shop_settings` singleton, identical for every install.

## 3. Environment variables

Server-only (never `VITE_`): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET` (32+ chars). Optional: `RESET_TOKEN_TTL_MINUTES`. Nothing needs to be browser-visible. `.env.example` is rewritten with these names and empty values only; `.env` stays gitignored. All Supabase variables are removed at the final cutover step.

## 4. Database design

New `drizzle/schema.ts` (sqlite dialect) + one baseline migration. Conversions applied uniformly:

| Postgres | SQLite/libSQL |
|---|---|
| `uuid` / `gen_random_uuid()` | `text` PK, UUID generated in server code |
| `numeric(12,2)` money | `integer` paise (`*_paise` internally, converted to rupees at the API edge so the UI receives the same numbers it does today) |
| `numeric(5,2)` tax rate | `integer` basis points (1800 = 18%) |
| `timestamptz` / `now()` | `text` ISO-8601 UTC, default `current_timestamp` |
| `date` | `text` `YYYY-MM-DD` |
| `boolean` | `integer` 0/1 |
| `numeric[]` allowed_gst_rates | JSON text |
| enum `app_role` | `text` + CHECK |
| `jsonb` (function args/returns only) | plain TS objects; never stored |

Preserved exactly: all 15 tables and every column; all primary keys; all foreign keys with the same `on delete restrict/cascade/set null`; unique constraints (`invoice_number`, `user_roles(user_id,role)`, `shop_settings.singleton`); partial/expression unique indexes on `lower(sku)`, `barcode`, `phone`; the `lower(name)` and all listed performance indexes; every CHECK (discount_type, status, receipt_width, quantity > 0, payment/refund methods); NOT NULL; defaults. `PRAGMA foreign_keys = ON` is set on each connection. One new table `users` (id, email unique, password_hash, created_at) replacing Supabase Auth, and `password_resets` (token hash, user, expires_at) only if you want email-based reset. Schema is not simplified anywhere.

## 5. Database logic mapping

All logic moves into `src/lib/*.functions.ts` (server functions) backed by `src/lib/*.server.ts` helpers. Each keeps the same name, inputs and output shape, so calling code changes minimally.

| Current | Becomes | Notes |
|---|---|---|
| has_role / is_admin | `requireAdmin()` helper | Reads session cookie, checks `user_roles`; called first in every protected function |
| claim_admin_if_first | part of signup server fn | Inside a transaction: if no admin exists, grant admin |
| touch_updated_at + 3 triggers | SQLite triggers (ported 1:1) | Same behaviour |
| apply_stock_change | transaction helper | Updates stock + inserts stock_movement, always inside the caller's transaction |
| create_sale | server fn + single transaction | Full logic ported to TypeScript; see §6 |
| create_purchase | server fn + transaction | Purchase, items, stock increase, movements |
| create_sales_return | server fn + transaction | Return, items, returned_quantity, stock restore, invoice status recompute |
| adjust_stock / set_opening_stock | server fns + transaction | Same validation and movement reason |
| dashboard_stats | server fn, read-only queries | Postgres `date_trunc`/`interval` rewritten with SQLite date functions on ISO text |
| db_usage | server fn | Row counts + Turso platform size (no `pg_database_size`); the Settings gauge keeps working |
| cleanup_import_batches | lazy application task | Runs on import-dialog open / first admin request each day; no cron infrastructure |
| RLS (17 policies) | `requireAdmin()` in every server fn | §8 |
| GRANTs | none needed | Connection is server-side only |

Each server function: Zod-validated input, auth then authorization, explicit transaction, typed errors mapped to the same toast messages users see today.

## 6. Transaction integrity

Every multi-step operation runs as one libSQL interactive transaction opened with `BEGIN IMMEDIATE` (acquires the write lock up front, so concurrent sales serialize instead of colliding). Any thrown error rolls back the whole thing — no partial invoices.

`create_sale` order, unchanged from today: verify admin → validate cart non-empty, method in cash/card/upi, discount type valid → read settings → for each line, decrement stock with `UPDATE products SET current_stock = current_stock - ? WHERE id = ? AND current_stock >= ?` and abort if zero rows changed (this replaces `SELECT FOR UPDATE` and is the overselling guard) → compute discount allocation and GST in integer paise using the existing algorithm, last line absorbing the rounding remainder → reserve invoice number → insert invoice, invoice_items, payment, stock_movements → commit → return `{ invoice_id, invoice_number, total }`. Purchases, adjustments, opening stock, returns and refunds follow the same pattern with the same guards (returns cannot exceed `quantity - returned_quantity`).

## 7. Invoice numbering

`UPDATE shop_settings SET invoice_next_number = invoice_next_number + 1 RETURNING invoice_next_number` inside the same `BEGIN IMMEDIATE` transaction. Prefix, optional year segment and zero padding come from settings exactly as now. The write lock plus the existing `UNIQUE` on `invoice_number` makes duplicates impossible under concurrent billing; once issued, a number is never reused.

## 8. Authentication, sessions, authorization

`users` table with email + password hash (scrypt via WebCrypto-compatible implementation, per-user salt). Server functions: `signUp`, `signIn`, `signOut`, `changePassword`, `requestPasswordReset`/`completePasswordReset`. Sessions use TanStack Start's encrypted `useSession` with `SESSION_SECRET`: HTTP-only, `secure`, `sameSite=lax`, `maxAge` 30 days, holding only the user id. Fixed 30-day expiry (not sliding) so the login date is predictable; survives refresh and browser restart; sign-out clears the cookie immediately; the cookie is signed/encrypted so tampering fails closed. Nothing sensitive in localStorage.

`/_authenticated/route.tsx` keeps its guard but calls a `getSessionUser` server function instead of Supabase, and the same `redirect({ to: "/auth" })`. Every protected server function independently calls `requireAdmin()` — the route guard is UX, the server check is security. Expired or invalid session → 401 → redirect to sign-in with the current toast. Unauthenticated callers hitting a server function directly get nothing back. The sign-in screen itself is unchanged.

Password reset: without an email provider, "Forgot password?" is only deliverable as an owner-initiated change from Settings. If you want the emailed reset link kept exactly as today, that needs an email service (Resend) — tell me which you want; I will keep the button hidden rather than broken if you choose the simple route.

## 9. Features (all preserved)

Frontend-only, zero change: receipts (58mm/80mm), browser printing, invoice PDF, bill text, WhatsApp `wa.me` link, native share, copy, export, PWA manifest/install, barcode input handling, all UI components, formatting and the billing math helpers.

Backend implementation changes, no UI change: login, dashboard, products, search, import, stock, adjustments, movements, purchases, suppliers, customers, POS, discounts, GST toggle, cash/card/UPI, invoice numbering and history, returns/refunds, reports, low-stock alerts, settings. No feature is removed, redesigned or simplified. Sharing and printing require no backend work at all.

## 10. Migrations and clean initialization

Drizzle sqlite migrations in `drizzle/migrations/`, numbered and ordered, tracked in a `__drizzle_migrations` table so re-running is safe. One baseline migration creates schema + indexes + constraints + triggers and inserts the single default `shop_settings` row. No products, customers, invoices or users are seeded. A `bun run db:migrate` script applies migrations to whichever database the env vars point at — identical files for your test database and every customer.

## 11. Backup, maintenance, deployment

Turso's built-in point-in-time recovery covers accidental deletion; add a weekly (daily for busy stores) `turso db shell ... .dump` to a file kept for 30 days on your machine or cheap object storage; restore = create database from dump or use PITR to a timestamp. Maintenance: import_batches cleanup lazily as above; expired sessions need no cleanup (stateless cookies); usage reporting via row counts.

Deployment, repeatable per client: create their Turso database → set the three env vars in Vercel (Production + Preview) → run migrations against it → deploy the same repo → first sign-up creates the admin → owner fills in Settings → run the verification checklist.

## 12. File-level plan

**Create:** `src/lib/db.server.ts`, `src/lib/auth.server.ts`, `src/lib/session.server.ts`, `src/lib/auth.functions.ts`, and per-domain pairs `products`, `customers`, `suppliers`, `purchases`, `invoices`, `stock`, `reports`, `settings` (`*.functions.ts` + `*.server.ts`), `src/lib/money.ts` (paise helpers), `drizzle/migrations/0000_pos_sqlite.sql`, `scripts/migrate.ts`, `TURSO-SETUP.md`.

**Modify:** `src/routes/auth.tsx`, `src/routes/reset-password.tsx`, `src/routes/_authenticated/route.tsx` (auth calls only), `billing.tsx`, `dashboard.tsx`, `products.tsx`, `purchases.tsx`, `customers.tsx`, `invoices.tsx`, `stock.tsx`, `reports.tsx`, `settings.tsx` (swap query functions, keep JSX), `src/hooks/useShopSettings.ts`, `src/components/products/{product-form-dialog,import-dialog,adjust-stock-dialog}.tsx`, `src/start.ts` (drop the Supabase bearer attacher), `drizzle/schema.ts`, `drizzle.config.ts`, `package.json`, `.env.example`, `DEPLOYMENT.md`.

**Remove (last step, after verification):** `src/integrations/supabase/*`, `supabase/production-setup.sql`, `supabase/config.toml`, old Postgres migrations, `@supabase/supabase-js`.

**Untouched:** every `src/components/ui/*`, `receipt.tsx`, `return-receipt.tsx`, `page-header.tsx`, `stat-card.tsx`, `src/lib/{format,billing,share,export,invoice-pdf,report-pdf,utils}.ts`, `src/styles.css`, `src/router.tsx`, `public/*` including the PWA manifest and icons.

## 13. Build sequence

1. SQLite schema + migration script + `db.server.ts` (no UI touched).
2. Auth, sessions, route guard.
3. Read paths (products, customers, suppliers, invoices, stock, settings, dashboard, reports).
4. Write transactions: purchases, adjustments, opening stock, then sale, then returns.
5. Cleanup, db usage, `.env.example`, docs.
6. End-to-end test against your own test Turso database.
7. Remove Supabase and freeze the version.

## 14. Risk table

| Area | Difficulty | Risk | Why | Mitigation |
|---|---|---|---|---|
| Sale transaction | High | High | Most complex logic; money + stock | Port line by line, compare totals against current app on identical carts |
| Return/refund | High | High | Partial returns, status recompute | Same side-by-side comparison |
| Auth + sessions | High | Medium | Built from scratch | Standard hashing + framework session; explicit tests |
| RLS replacement | Medium | High | Missing a check exposes data | Single `requireAdmin()` helper as the first line of every function; audit the list |
| Invoice numbering | Low | Medium | Duplicates under concurrency | `BEGIN IMMEDIATE` + unique constraint |
| Money types | Medium | Medium | Rounding drift | Integer paise end to end |
| Schema migration | Medium | Low | Mechanical | Generated + reviewed once, reused everywhere |
| Dashboard/reports dates | Medium | Low | SQLite date syntax | Verify against known data |
| Backup/recovery | Low | Low | Turso PITR + dumps | Test one restore before handover |
| Concurrency | Medium | Medium | Single writer | Fine for one-counter stores; documented |

## 15. Testing checklist

Auth: sign up (first = admin), sign in, sign out, refresh, browser restart, 30-day persistence, expired session, password change/reset, unauthorized direct call to a server function, tampered cookie. Products: add, edit, search, barcode, import, duplicate SKU/barcode rejection, low stock. Stock: adjust, opening stock, movements log. Purchases: create, stock increase, supplier. Billing: search, barcode, quantity, percent and amount discount, GST on/off, inclusive/exclusive pricing, cash/card/UPI, invoice numbering sequence, overselling blocked, stock decrease, receipt 58mm/80mm, print, share, WhatsApp. Returns: partial and full, refund, stock restoration, invoice status, history. Reports: sales, payments, products/stock, low stock, purchases, movements, exports. Deployment: clean database, migration run, admin creation, shop configuration, env vars, Vercel deploy, and confirm no Turso token appears in any browser bundle or network response.

## 16. Verdict

Turso is suitable. The UI, screens, workflows, authentication experience, GST/discount/billing maths, inventory integrity, invoice numbering, printing, thermal receipts, bill and WhatsApp sharing, and PWA behaviour are all preserved. 30-day persistent login is achievable and the browser never sees Turso credentials. One generic codebase serves every client, you can test it first on your own Turso database, and the same migration files initialize every clean database. Heaviest effort: the sale and return transactions plus the new auth layer. Unchanged: all UI, printing, PDF, sharing, PWA and business formulas.

One decision needed from you before implementation: password reset — keep emailed reset links (requires an email service) or switch to owner-initiated password change from Settings.
