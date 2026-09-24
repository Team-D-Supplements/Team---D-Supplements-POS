# Production migration: GYM Supplement Shop POS

Move the existing POS app onto a new client-owned Supabase project and prepare it for GitHub → Vercel hosting, with no change to the current development backend and no change to how the app looks or works.

## What the inspection found

The uploaded export is the source of truth. Confirmed by reading the code:

- The app talks to the backend **only from the browser**. There are no server functions, no edge functions, no scheduled jobs, no file storage buckets.
- The **entire database is already captured in 4 migration files** under `drizzle/migrations/`. Nothing has to be reverse-engineered.
- Sign-in is **email + password** (sign-up, sign-in, password reset). No social logins.
- Backend connection is already read from environment variables — nothing is hard-coded.

Database contents to recreate:

- **14 tables**: user_roles, profiles, shop_settings, products, customers, suppliers, purchases, purchase_items, invoices, invoice_items, payments, sales_returns, sales_return_items, stock_movements, import_batches
- **12 database functions**: has_role, is_admin, claim_admin_if_first, touch_updated_at, apply_stock_change, create_sale, create_purchase, create_sales_return, adjust_stock, set_opening_stock, db_usage, dashboard_stats, cleanup_import_batches
- **3 triggers** (auto-update timestamps on products, customers, shop_settings)
- **All access rules (RLS) and permissions**, unchanged — admin-only access to business data, own-profile-only access to profiles
- **All indexes and uniqueness rules**, including the duplicate-barcode and duplicate-SKU guards
- One enum type (`app_role`)

## Plan

### 1. Bring the app into this project
Load the exported app here exactly as-is. No redesign, no feature changes, no rewrites.

### 2. Set up the client's new database
Apply the four existing migration files, in order, to the new Supabase project. Structure, names, relationships, constraints, security rules, functions and triggers stay identical.

Starting data: only the single default shop-settings row that the current setup already creates. No products, customers, invoices or test data are copied.

Admin access: the app already contains a "first signed-up user becomes admin" step, so the client creates their own admin account by signing up once. No admin credentials are transferred.

### 3. Point the app at environment variables only
The app already reads its connection settings from variables. I will confirm every path uses them and that nothing privileged can reach the browser. No new variables are invented.

Required in Vercel (browser-side, safe to expose — these are public by design):
```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```
Same three values also set without the `VITE_` prefix (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`) for the server-rendering side, which the code already falls back to.

The service-role key and the database password are **never** added to Vercel or to any app file.

### 4. Make the build work on Vercel
The current build targets a different hosting provider. I will switch the build target to Vercel while keeping server-rendering behaviour identical. If that target cannot be set cleanly, the fallback is a browser-only build — every screen already loads its data in the browser, so behaviour is unchanged either way. I will tell you which one was used.

### 5. Verify before handover
Check against the new database: login/signup/password reset, dashboard, products, product import, barcode handling, stock and adjustments, stock movements, purchases, customers, billing/POS, discounts, GST calculation and toggle, cash/card/UPI recording, invoice creation and numbering, invoice history, returns and refunds, reports, low-stock alerts, receipt printing, bill sharing, settings.

### 6. Final report
Tables migrated, functions/triggers migrated, security rules migrated, authentication notes, Vercel variables, files changed, manual Supabase steps, manual Vercel steps, remaining risks, and a production testing checklist.

## What I need from you first

**Connect the client's Supabase project to Lovable** — Project Settings → Connectors → Supabase, then sign in to the client's Supabase account. This cannot be done from chat. Until that is connected I can prepare everything else but cannot create their database structure.

Also needed in the client's Supabase dashboard (I will confirm which are still outstanding after connecting):
- Turn on email + password sign-in
- Decide whether new sign-ups must confirm their email (the current setup signs people in immediately; I will match whichever you choose)
- Set the site URL and the password-reset redirect address to the Vercel address

## Safety commitments

- Your current development/demo database is not touched, read from, or deleted.
- No business data is copied into the client's database.
- No feature, screen or business rule is changed.
- Nothing privileged is placed in browser code.
- I will ask before any destructive action.

## Technical notes

- Stack: TanStack Start (React 19, Vite), Supabase JS client only; no Drizzle runtime usage (Drizzle is migration tooling only).
- Migrations applied in order: `0000_pos_core_schema.sql`, `0001_pos_business_functions.sql`, `0002_fix_create_sale_order.sql`, `0003_return_refund_reporting_details.sql`.
- Lovable-preview-only helpers (`previewAuthStorage`, error reporting, cron auth) already fall back to standard behaviour off Lovable domains; they will be reviewed and left inert rather than removed, to avoid regressions.
- `supabase/config.toml` still references the old project id and will be updated.
- The `.env` in the export holds the old development values and will not be committed; Vercel supplies production values.
