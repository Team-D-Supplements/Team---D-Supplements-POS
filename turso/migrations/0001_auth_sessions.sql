-- Server-side login sessions (fixed 30-day expiry, revocable).
-- The cookie carries a random token; only its SHA-256 hash is stored here.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,              -- sha256(token), hex
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
