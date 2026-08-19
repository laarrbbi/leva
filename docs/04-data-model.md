# Data model

SQLite. Schema in `src/server/db/migrations/`.

Conventions applied throughout:

- Integer surrogate key on every table. Anything exposed in a URL gets a
  separate high-entropy `public_id`, so ids are never enumerable.
- Timestamps are ISO-8601 UTC strings — readable directly in `sqlite3`.
- No customer PII. IPs are peppered-hashed and truncated; user agents reduced to
  a family.
- Constraints live in the schema, not only in application code.

---

## Tables

```
 store_settings (1 row)
       │
       │              ┌──────────────┐
       │              │ admin_users  │──1:N──▶ sessions
       │              └──────┬───────┘
       │                     │ 0:N
       │                     ▼
       │                 audit_log
       │
   ┌───┴────┐
   │ staff  │──0:N──▶ visit_tokens ─────(redeemed, then discarded)
   └───┬────┘
       │ 0:N
       ▼
   ┌──────────┐        ┌─────────────────┐        ┌─────────────┐
   │ feedback │──1:N──▶│ feedback_wishes │──0:1──▶│ suggestions │
   └──────────┘        └─────────────────┘        └─────────────┘
```

### `store_settings`

One row, held to one by `CHECK (id = 1)` — the table cannot fork into two
configurations.

Holds the store name and slug, the customer-facing wording, the three
question toggles, the Google review link, and the second-platform block
(`pickup_enabled`, `pickup_name`, `pickup_tagline`, `pickup_url`).

The second platform is four columns rather than a generic key/value bag,
specifically so its URL can be constrained and audited like any other outbound
link. A settings bag would make that invisible.

### `admin_users`

`password_hash` is `scrypt$N$r$p$salt$hash` — parameters travel with the hash, so
cost can be raised later without a migration.

`failed_attempts` and `locked_until` implement the online-guessing lockout, both
reset on any successful authentication.

Two roles: `owner` and `manager`.

### `sessions`

Stores only the SHA-256 digest of the session token and of its CSRF companion. A
database dump therefore yields nothing replayable.

Both timeouts are enforced on read: `expires_at` (absolute) and `last_seen_at`
against the idle window. `revoked_at` is set on logout and on password change.

### `staff`

`code` is a short random string, not the row id — person-specific tags get
printed and stuck on a counter, and sequential ids would let anyone enumerate the
team.

Deletion is a soft `archived_at`. **Removing a name from a screen must never
silently rewrite last month's numbers**, so past ratings survive; the person just
disappears from every list.

### `suggestions`

The admin-authored one-tap chips. `sort_order` controls presentation.

### `visit_tokens`

The scan credential: minted when the kiosk page renders, burned on submit.

Only the digest is stored. `used_at` is set inside the same `UPDATE` that reads
it, so two concurrent submissions of one token race in SQLite and exactly one
wins. Checking with a separate `SELECT` would leave a window for a double
submission.

`staff_id` is copied here from the tag, which is what makes the team-member
binding non-forgeable by the client.

### `feedback`

`public_id` is 16 random bytes — used in the `google-click` callback URL so
nothing enumerable is exposed.

`staff_name_at_time` denormalises the name deliberately: a rating must remain
readable after the person is renamed or archived.

`google_cta_clicked_at` records that the customer tapped through. It does not
and cannot record whether a review was written — Google does not report that, and
finding out would mean tracking the customer off-site.

### `feedback_wishes`

Either a tapped suggestion or a typed wish, never both, enforced by:

```sql
CHECK ((is_custom = 1 AND suggestion_id IS NULL)
    OR (is_custom = 0 AND suggestion_id IS NOT NULL))
```

`label` is stored alongside, so deleting a chip does not erase what customers
actually asked for.

### `audit_log`

Append-only by construction: the codebase contains no update or delete path.
Records actor, action, target, a short human summary and a hashed IP — never the
secret that changed.

### `rate_limits`

Fixed-window counters, `WITHOUT ROWID` (the primary key *is* the row). Kept in
SQLite rather than memory so limits survive a restart and hold across instances
sharing the file.

A fixed window can allow up to 2× the limit across a boundary. That is accepted:
one atomic upsert, no background sweeper on the hot path, and these limits size
abuse prevention, not billing.

---

## Referential integrity

`PRAGMA foreign_keys = ON` is set on every connection. **SQLite defaults it
off** — without it, every `ON DELETE` clause below is decorative.

| Relationship | On delete | Why |
| --- | --- | --- |
| `sessions` → `admin_users` | `CASCADE` | A deleted account must not keep live sessions |
| `feedback` → `staff` | `SET NULL` | The rating survives; the name is already denormalised |
| `feedback_wishes` → `feedback` | `CASCADE` | Wishes have no meaning without their feedback |
| `feedback_wishes` → `suggestions` | `SET NULL` | The typed label survives the chip |
| `visit_tokens` → `staff` | `SET NULL` | A token outliving its person is harmless |
| `audit_log` → `admin_users` | `SET NULL` | The trail must outlive the account it describes |

---

## Retention and GDPR

| Data | Kept | Lawful basis |
| --- | --- | --- |
| Ratings | Indefinitely | Legitimate interest — anonymous, and aggregate history is the product |
| Comments | Until the retention sweep | Legitimate interest, minimised by `redactOldComments()` |
| Hashed IP | Cleared with the comment | Legitimate interest — abuse prevention only |
| User-agent family | Indefinitely | Not personal data at this granularity |
| Admin accounts | Life of the account | Contract |
| Audit log | Indefinitely | Legal obligation / legitimate interest |

**No customer identity is ever collected.** No name, email, phone or account, so
there is no data-subject access request to answer for a customer — there is
nothing tied to them.

An IP address *is* personal data under GDPR, which is why it is never stored raw.
A plain hash would be worthless — the entire IPv4 space can be brute-forced in
seconds — so it is an HMAC under `IP_HASH_SECRET`, truncated. Rotating that
secret orphans every stored value at once.

---

## Housekeeping

| Function | Does |
| --- | --- |
| `pruneExpiredSessions()` | Deletes expired sessions and revocations older than 30 days |
| `pruneVisitTokens()` | Deletes tokens expired for more than a day |
| `redactOldComments(days)` | Clears comments and their IP hashes past the retention window |
| Rate-limit sweep | Opportunistic: ~1 request in 200 prunes dead windows, so no background job is needed |

Schedule the first three from cron or a scheduled container task.

---

## Indexes

| Index | Serves |
| --- | --- |
| `idx_feedback_created` | The dashboard list, newest first |
| `idx_feedback_staff` | Per-person averages |
| `idx_wishes_feedback` / `idx_wishes_label` | Wish lookup and the tally |
| `idx_sessions_user` / `idx_sessions_expires` | Session validation and pruning |
| `idx_staff_active` / `idx_suggestions_active` | The kiosk's two list queries |
| `idx_visit_tokens_expires` | Pruning |
| `idx_rate_limits_window` | Pruning |

Unique constraints carry their own indexes: `store_settings.slug`,
`admin_users.email`, `sessions.token_hash`, `staff.code`, `feedback.public_id`,
`visit_tokens.token_hash`.
