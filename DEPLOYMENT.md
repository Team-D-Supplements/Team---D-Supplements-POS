# Deployment — SuppPOS (Turso + Vercel)

```text
GitHub repo (one generic codebase)
      |
      v
Vercel project (one per client)  --server functions-->  Turso database (one per client)
```

- One client = one Turso database + one Vercel project. No shared data, no tenant ids.
- The code is identical for every client; only the three environment variables differ.
- The browser only talks to the app's own server functions. Turso credentials and
  `SESSION_SECRET` are server-only.

## Per-client checklist

1. **Database** — `turso db create <client-db>`; note the URL and create a token.
2. **Schema** — `TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... bun run db:migrate`
   (creates all tables and the default shop settings; no business data).
3. **Vercel** — import the GitHub repo, build command `npm run build`, add:
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET` (unique, 32+ chars),
   plus the build setting `NITRO_PRESET=vercel` (the build otherwise defaults to a
   Cloudflare Workers target; confirm the first Vercel deploy serves `/auth`).
4. **Deploy**, open the site and create the owner account (first sign-up = admin).
5. **Settings** — shop name, address, phone, GSTIN, invoice prefix, receipt footer.
6. **Verify** — one test sale, receipt print, share, report; sign out and back in.

Full details, backups and the locked-out-owner command: see `TURSO-SETUP.md`.

## Production test checklist

- Sign up (first = admin), sign in, sign out, stays signed in after refresh/restart.
- Second account cannot see store data.
- Add/edit product, barcode search, import CSV, adjust stock.
- Purchase increases stock; sale decreases stock; oversell is blocked.
- Discount (% and Rs), GST on/off, cash/card/UPI, invoice numbers sequential.
- Print 58/80 mm receipt, PDF, share/WhatsApp.
- Return restores stock; reports and dashboard match.
- Change password in Settings.
