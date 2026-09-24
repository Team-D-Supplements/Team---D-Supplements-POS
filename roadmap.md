# Turso migration roadmap

Phased; stop for user approval after each phase.

- [x] Phase 1 — SQLite schema, reusable migration, migration runner, server-side Turso connection
- [x] Phase 2 — Auth (users, hashing, 30-day HTTP-only session), route guard, Settings password change
- [x] Phase 3 — Full data layer on Turso server functions: reads AND writes; follow-ups: invoice-number overflow guard, storage card fix
- [x] Phase 4 — Import-log 30-day cleanup, expired-session pruning, docs refresh 
- [x] Phase 5 — Supabase removed; Turso-only generic codebase (approved)
- [x] Phase 6 (Lovable part) — hosted-readiness review + local validation — awaiting approval
- [ ] Phase 6 (Antigravity part) — same checks on user's own hosted Turso DB + first Vercel deploy (blocked: needs user's Turso/Vercel)
- [ ] Phase 7 — Production freeze and first client delivery
