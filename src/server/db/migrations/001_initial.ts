/**
 * Migration 001 — initial schema.
 *
 * Migrations are TypeScript modules rather than loose `.sql` files so they are
 * bundled with the server build: a standalone container has no source tree to
 * read from at runtime.
 */
export const sql = `-- ===========================================================================
-- Leva — initial schema
--
-- Design rules applied throughout:
--   * Every table has an integer surrogate key; anything exposed in a URL uses
--     a separate high-entropy \`public_id\` so ids are not enumerable (IDOR).
--   * Timestamps are stored as ISO-8601 UTC strings for readability in \`sqlite3\`.
--   * No customer PII is stored. IP addresses are peppered-hashed and truncated;
--     user agents are reduced to a coarse family string.
--   * Deletion of a team member preserves historical ratings (ON DELETE SET NULL)
--     so averages stay honest, while the person's name disappears from the UI.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Store configuration. Single row, guarded by a CHECK so it can never fork.
-- --------------------------------------------------------------------------
CREATE TABLE store_settings (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  slug                  TEXT    NOT NULL UNIQUE,
  store_name            TEXT    NOT NULL,
  welcome_headline      TEXT    NOT NULL DEFAULT 'How was your visit?',
  welcome_subline       TEXT    NOT NULL DEFAULT 'It takes about 20 seconds.',
  thanks_headline       TEXT    NOT NULL DEFAULT 'Thank you!',
  thanks_subline        TEXT    NOT NULL DEFAULT 'Your feedback goes straight to the owner.',
  -- Google "write a review" deep link. Validated against an allowlist of Google
  -- hosts before it is stored, so the admin panel cannot become an open redirect.
  google_review_url     TEXT,
  google_place_id       TEXT,
  -- Feature switches the owner controls from /admin/settings.
  ask_for_staff_rating  INTEGER NOT NULL DEFAULT 1 CHECK (ask_for_staff_rating IN (0, 1)),
  ask_for_wishes        INTEGER NOT NULL DEFAULT 1 CHECK (ask_for_wishes IN (0, 1)),
  ask_for_comment       INTEGER NOT NULL DEFAULT 1 CHECK (ask_for_comment IN (0, 1)),
  -- Second destination the store hands out its own QR/NFC tag for, alongside the
  -- review kiosk (for Levadura Madre: \"Pedidos desde el coche\"). Kept as its
  -- own set of columns rather than a generic key/value bag so the URL can be
  -- constrained and audited like any other outbound link.
  pickup_enabled        INTEGER NOT NULL DEFAULT 0 CHECK (pickup_enabled IN (0, 1)),
  pickup_name           TEXT    NOT NULL DEFAULT 'Pedidos desde el coche',
  pickup_tagline        TEXT    NOT NULL DEFAULT 'Pide sin bajarte del coche.',
  pickup_url            TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- --------------------------------------------------------------------------
-- Administrators.
-- --------------------------------------------------------------------------
CREATE TABLE admin_users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  email               TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  -- scrypt, encoded as  scrypt$N$r$p$<salt-b64>$<hash-b64>  (see server/auth/password.ts)
  password_hash       TEXT    NOT NULL,
  display_name        TEXT    NOT NULL,
  role                TEXT    NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager')),
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  -- Online-guessing defence. Reset on any successful authentication.
  failed_attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until        TEXT,
  password_changed_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at       TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- --------------------------------------------------------------------------
-- Server-side sessions. The cookie carries an opaque token; only its SHA-256
-- digest is stored, so a database leak cannot be replayed as a live session.
-- --------------------------------------------------------------------------
CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash    TEXT    NOT NULL UNIQUE,
  -- CSRF token bound to this session (double-submit cookie pattern).
  csrf_hash     TEXT    NOT NULL,
  ip_hash       TEXT,
  user_agent    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at    TEXT    NOT NULL,
  revoked_at    TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- --------------------------------------------------------------------------
-- Team members the customer can rate.
-- \`code\` is the value embedded in a person-specific QR/NFC tag (?t=<code>).
-- --------------------------------------------------------------------------
CREATE TABLE staff (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  -- Two initials rendered in a coloured circle; avoids hosting photos (no PII sprawl).
  initials    TEXT    NOT NULL,
  accent      TEXT    NOT NULL DEFAULT 'indigo',
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT
);
CREATE INDEX idx_staff_active ON staff(is_active, sort_order);

-- --------------------------------------------------------------------------
-- Admin-authored quick picks shown on the "what should we stock?" step.
-- --------------------------------------------------------------------------
CREATE TABLE suggestions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT    NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_suggestions_active ON suggestions(is_active, sort_order);

-- --------------------------------------------------------------------------
-- One scan == one token == at most one submission. Minted server-side when the
-- kiosk page renders; burned when feedback is accepted. This is what stops a
-- single tag from being replayed into thousands of fake ratings.
-- --------------------------------------------------------------------------
CREATE TABLE visit_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT    NOT NULL UNIQUE,
  staff_id   INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  source     TEXT    NOT NULL DEFAULT 'qr' CHECK (source IN ('qr', 'nfc', 'link')),
  ip_hash    TEXT,
  issued_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT    NOT NULL,
  used_at    TEXT
);
CREATE INDEX idx_visit_tokens_expires ON visit_tokens(expires_at);

-- --------------------------------------------------------------------------
-- Customer feedback.
-- --------------------------------------------------------------------------
CREATE TABLE feedback (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Unguessable id used in the /api/feedback/<public_id>/... callback URL.
  public_id             TEXT    NOT NULL UNIQUE,
  store_rating          INTEGER NOT NULL CHECK (store_rating BETWEEN 1 AND 5),
  staff_id              INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  -- Denormalised so a rating survives the team member being deleted.
  staff_name_at_time    TEXT,
  staff_rating          INTEGER CHECK (staff_rating BETWEEN 1 AND 5),
  comment               TEXT,
  source                TEXT    NOT NULL DEFAULT 'qr' CHECK (source IN ('qr', 'nfc', 'link')),
  -- Set when the customer actually taps through to Google. Lets the owner see
  -- conversion without ever learning whether a review was left or what it said.
  google_cta_clicked_at TEXT,
  ip_hash               TEXT,
  user_agent_family     TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX idx_feedback_staff ON feedback(staff_id);

-- --------------------------------------------------------------------------
-- Products the customer wants to see. Either a tapped admin suggestion or a
-- free-text wish — exactly one of the two, enforced by CHECK.
-- --------------------------------------------------------------------------
CREATE TABLE feedback_wishes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id   INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  suggestion_id INTEGER REFERENCES suggestions(id) ON DELETE SET NULL,
  label         TEXT    NOT NULL,
  is_custom     INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((is_custom = 1 AND suggestion_id IS NULL) OR (is_custom = 0 AND suggestion_id IS NOT NULL))
);
CREATE INDEX idx_wishes_feedback ON feedback_wishes(feedback_id);
CREATE INDEX idx_wishes_label ON feedback_wishes(label);

-- --------------------------------------------------------------------------
-- Append-only audit trail of everything an administrator changes.
-- --------------------------------------------------------------------------
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action      TEXT    NOT NULL,
  target      TEXT,
  detail      TEXT,
  ip_hash     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- --------------------------------------------------------------------------
-- Fixed-window counters backing the rate limiter. Kept in SQLite rather than
-- memory so limits survive a restart and hold across multiple app instances
-- sharing one database file.
-- --------------------------------------------------------------------------
CREATE TABLE rate_limits (
  bucket_key   TEXT    NOT NULL,
  window_start INTEGER NOT NULL,
  hits         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
) WITHOUT ROWID;
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);
`;
