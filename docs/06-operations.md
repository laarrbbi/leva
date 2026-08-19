# Operations

## Deploying

`next.config.ts` sets `output: 'standalone'`. A container needs the build output
plus a writable volume for the SQLite file.

```bash
npm ci
npm run build
npm run db:migrate     # release phase — before the new server starts
npm start
```

Two things are not optional:

- **HTTPS.** Session cookies use the `__Host-` prefix in production, which
  browsers reject over plain HTTP. Sign-in will not work without TLS.
- **A persistent volume for `DATABASE_PATH`.** It is the entire database. An
  ephemeral container filesystem loses every rating on restart.

### Pre-flight

- [ ] `SESSION_SECRET` and `IP_HASH_SECRET` are 32+ bytes, independent of each other, from a CSPRNG
- [ ] `APP_ORIGIN` matches the real public origin exactly, no trailing slash
- [ ] `TRUST_PROXY_HEADERS` is `1` **only** if a proxy you control overwrites
      `X-Forwarded-For` — otherwise clients forge their own address and every
      rate limit stops working
- [ ] TLS terminates in front, HSTS is being served
- [ ] `DATABASE_PATH` points at the persistent volume
- [ ] The seed admin password has been changed from whatever seeded it
- [ ] `npm audit` is clean

## Backups

The database is one file. With WAL enabled, copy it correctly:

```bash
sqlite3 /data/leva.db ".backup '/backups/leva-$(date +%F).db'"
```

`.backup` is safe against a live writer; `cp` on a WAL database can capture a
torn state. Restore is the reverse copy with the app stopped.

Test a restore before you need one. An untested backup is a hypothesis.

## Monitoring

| Signal | Where | Act when |
| --- | --- | --- |
| Liveness | `GET /api/health` | Non-200 — the orchestrator should restart |
| Failed sign-ins | `/admin/activity`, red dots | A burst you cannot account for |
| Settings changes | `/admin/activity` | Any change to an outbound link you did not make |
| Disk usage | Host | The database file grows steadily |
| Submission volume | `/admin` | A spike far above normal footfall suggests scripted abuse |

## Housekeeping

Schedule from cron or a scheduled task:

| Job | Frequency | Function |
| --- | --- | --- |
| Prune sessions | Daily | `pruneExpiredSessions()` |
| Prune visit tokens | Daily | `pruneVisitTokens()` |
| Redact old comments | Monthly | `redactOldComments(days)` — pick the window in your privacy notice |

Rate-limit rows are swept opportunistically on the request path; no job needed.

## Incident response

### Suspected admin compromise

1. Change the password. This revokes **every** session everywhere, immediately.
2. Read `/admin/activity` from before the suspected compromise onward.
3. Check Settings — specifically the Google link and the second-platform link.
   Repointing one of those is the highest-value action an attacker can take.
4. Check Team for members you did not add.
5. Rotate `SESSION_SECRET` and redeploy. Everyone is signed out.

### Suspected fake submissions

1. Filter `/admin/feedback` to the affected window.
2. Look at the source badges: a run of identical sources at machine speed is
   the signature.
3. Tighten `RULES.feedback` in `server/security/rate-limit.ts` and redeploy.
4. If tags were physically rewritten, reprint and re-write them — and lock the
   new NFC tags read-only.

### Database corruption

```bash
sqlite3 /data/leva.db "PRAGMA integrity_check;"
```

Anything but `ok`: stop the app, restore the most recent backup, restart.

## Rotating secrets

| Secret | Effect of rotating | Then |
| --- | --- | --- |
| `SESSION_SECRET` | Everyone is signed out | Redeploy |
| `IP_HASH_SECRET` | Every stored IP hash becomes unlinkable — rate limits reset once | Redeploy. This is also the fastest way to orphan historic IP data on request |

## Changing the tag address

Changing the slug in Settings **breaks every printed QR code and every written
NFC tag**. There is no redirect from the old slug.

Reprint and rewrite first, swap them in the shop, then change the slug.
