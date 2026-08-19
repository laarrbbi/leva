# Architecture

## Shape

One Next.js application, App Router, React Server Components by default, with a
SQLite file for storage. No separate API service, no ORM, no client-side state
library.

That is a deliberate ceiling, not an oversight. The product is one shop, a few
hundred submissions a week, and one or two administrators. Every component below
is sized for that, and the places where it stops scaling are named at the end.

---

## Layers

```
  app/            routes. Read params, call one thing, render.
    │             No SQL. No business rules.
    ▼
  actions/        the mutation boundary. CSRF, rate limit, validate, audit.
  api/            the same job for the public JSON endpoints.
    │
    ▼
  validation/     Zod. Every untrusted value crosses here exactly once.
    │             Downstream code never re-checks.
    ▼
  services/       use cases spanning more than one repository.
    │             Where "submit feedback" actually lives.
    ▼
  repositories/   all SQL, and nothing but SQL. Row shapes in, domain types out.
    │
    ▼
  db/             connection, pragmas, ordered migrations.
```

Two rules keep this honest:

1. **Dependencies point downward only.** A repository never reads a cookie; a
   route never writes SQL.
2. **Everything under `server/` imports `server-only`.** A stray import into a
   client component fails the build instead of shipping database code to a phone.

`lib/` holds pure helpers safe on both sides. `types/domain.ts` holds the shapes
both sides agree on. Neither imports from `server/`.

---

## Request flows

### A customer scans a tag

```
GET /r/my-store?t=abc&s=nfc
  │
  ├─ proxy.ts          mint nonce, attach CSP
  ├─ page.tsx          resolve store by slug → 404 if unknown
  │                    rate-limit token minting per hashed IP
  │                    resolve the team member from ?t
  │                    issue a single-use visit token
  └─ ReviewFlow        client component, holds the answers in local state
```

The page is `force-dynamic`. It mints a credential on every render, so caching it
would hand two customers the same token and silently drop one of their answers.

### The customer submits

```
POST /api/feedback
  │
  ├─ Origin check                    reject cross-site callers
  ├─ 8 KiB body cap                  before parsing, not after
  ├─ Zod parse                       trim, cap, strip control characters
  └─ submitFeedback()
       ├─ rate limit (hashed IP)
       ├─ honeypot + timing floor    silently reject bots
       ├─ redeem visit token         atomic; one scan, one submission
       ├─ re-derive the team member  from the token, not the request body
       ├─ re-check suggestion ids    against live rows
       └─ insert feedback + wishes   one transaction
```

The order is the point. Cheap stateless rejections come first, so junk never
reaches the database; the token is burned before anything is written, so a
replayed request cannot insert a row even if it wins the race.

### An admin changes a setting

```
Server Action
  │
  ├─ assertCsrf()      Origin check + token bound to the session row
  ├─ rate limit        caps the blast radius of a stolen session
  ├─ Zod parse         including the outbound-link allowlists
  ├─ repository write
  ├─ recordAudit()     append-only, names the links explicitly
  └─ revalidatePath()
```

---

## Why SQLite

| Reason | |
| --- | --- |
| The workload is one shop | Hundreds of writes a week, thousands of reads. This is not a database problem |
| Operations collapse to a file | Backup is `cp`. Restore is `cp`. No connection pool, no second container, no managed service bill |
| WAL keeps reads concurrent | The dashboard stays responsive while a customer submits |
| It is a real database | Foreign keys, `CHECK` constraints, transactions, partial indexes. The schema enforces its own invariants rather than trusting application code |

Pragmas set on every connection (`server/db/client.ts`):

| Pragma | Value | Why |
| --- | --- | --- |
| `journal_mode` | `WAL` | Readers do not block on a writer |
| `synchronous` | `NORMAL` | Durable against process crashes without an fsync per statement |
| `foreign_keys` | `ON` | **SQLite defaults this off.** Every `ON DELETE` clause in the schema is inert without it |
| `busy_timeout` | `5000` | Wait for a lock, then fail — never hang |

### Where it stops

SQLite allows one writer at a time. That is fine here and would not be for:

- multiple shops writing concurrently through one deployment,
- more than one app instance without shared storage,
- analytics scans over millions of rows.

The migration path is deliberate: all SQL is confined to `repositories/`, and
every function there returns a domain type rather than a row. Moving to Postgres
means rewriting those files and nothing above them.

---

## Migrations

TypeScript modules, not loose `.sql` files, in `server/db/migrations/`. They are
bundled with the server build — a standalone container has no source tree to
read from at runtime.

They run automatically on first connection, each in its own transaction, tracked
in `schema_migrations`. `npm run db:migrate` applies them without starting the
app, for a deployment's release phase.

Once a migration has shipped, it is never edited. Add a new one.

---

## Rendering

Server Components by default. Client Components exist where interaction demands
them, and are listed here in full because the list should stay short:

| Component | Why it is a client component |
| --- | --- |
| `review/review-flow` | Multi-step state, submission |
| `review/star-rating` | Hover preview |
| `review/staff-picker`, `wish-picker` | Selection state |
| `admin/form` | `useActionState` / `useFormStatus` |
| `admin/login-form`, `change-password-form` | Form state |
| `admin/nfc-writer` | Web NFC is browser-only |

Everything else — the entire dashboard, all read views — renders on the server.
The customer's phone downloads the review flow and nothing else.

---

## Failure behaviour

| Situation | Behaviour |
| --- | --- |
| Unknown store slug | 404 |
| Rate limit hit on the kiosk page | Plain "one moment" page, not an error |
| Expired or reused visit token | 409, and the customer is told to scan again |
| Invalid submission | 400, one generic message |
| Session expired mid-action | The action returns "please sign in again" rather than throwing |
| Database unavailable | `/api/health` returns 503; the orchestrator restarts the container |

Nothing in a failure path reveals which internal check failed.
