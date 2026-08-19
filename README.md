# Leva

A QR and NFC tag on your counter. The customer taps it, rates the visit in about
twenty seconds, tells you what to stock next, and is invited to leave a Google
review. You get everything in a dashboard.

No app to install. No account for the customer. No name, no email, no cookie
that follows anyone.

---

## What it does

**For the customer** — one page, three or four taps:

1. **How was your visit?** Five stars.
2. **Who helped you?** Pick a face, rate them. (A person-specific tag skips this.)
3. **What should we stock next?** One-tap chips you wrote, plus a free-text box.
4. **Anything else?** An optional message.
5. **Thank you** — with a button through to your Google review page.

**For you** — `/admin`:

| Section | What it is for |
| --- | --- |
| Overview | Averages, rating spread, most-requested products, team leaderboard |
| Feedback | Every response, filterable, newest first |
| Team | Add people, rename them, hide them; past ratings are always kept |
| Wishlist | The one-tap chips customers choose from |
| Tags | Printable QR codes and one-tap NFC writing |
| Settings | Store name, Google link, second platform, wording, which questions to ask |
| Activity | Append-only log of every admin change and sign-in attempt |

### Two tags, two destinations

The **review tag** opens the feedback flow. A **second platform** tag can be
switched on in Settings with its own name, tagline and https link — for a
curbside-ordering page, a menu, a booking form — and gets its own separate QR
code on the Tags page. One code per destination, on purpose: a single code
serving both would need a menu in between, which costs the tap it is meant to
save.

---

## A note on Google reviews

**The Google button is shown to every customer, whatever they rated you.**

Showing it only to people who gave four or five stars is called review gating.
It breaks [Google's review policy](https://support.google.com/contributionpolicy/answer/7400114),
and it is a prohibited commercial practice under the EU Unfair Commercial
Practices Directive and the US FTC's rule on consumer reviews. The realistic
downside is not a fine — it is Google removing your entire review history.

Leva is built so this is not a setting you can get wrong. The private rating is
what you act on; the public invitation is identical for everyone.

---

## Running it

Requires Node 20.11 or newer.

```bash
npm install
cp .env.example .env.local     # then fill it in — see below
npm run db:seed                # creates the store and your admin account
npm run dev
```

- Customer view: <http://localhost:3000/r/my-store>
- Dashboard: <http://localhost:3000/admin>

### Environment

Generate the two secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | yes | Public origin, no trailing slash. Builds tag URLs and validates request origins. |
| `SESSION_SECRET` | yes | 32+ bytes. Signs sessions. |
| `IP_HASH_SECRET` | yes | 32+ bytes. Peppers IP hashes. Rotating it orphans every stored hash. |
| `DATABASE_PATH` | no | SQLite file. Defaults to `./data/leva.db`. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | seed only | Read by `db:seed`, never stored in plaintext. |
| `TRUST_PROXY_HEADERS` | no | Set to `1` **only** behind a proxy you control. See below. |

> `TRUST_PROXY_HEADERS=1` makes the app believe `X-Forwarded-For`. If the app is
> directly reachable, a client can then forge its own address and every rate
> limit becomes decorative. Leave it at `0` unless a trusted proxy overwrites
> that header.

### Commands

```bash
npm run dev         # development server
npm run build       # production build
npm start           # run the build
npm run typecheck   # tsc --noEmit
npm test            # unit tests
npm run db:migrate  # apply migrations (run before starting a new release)
npm run db:seed     # idempotent seed
```

### Deploying

`next.config.ts` sets `output: 'standalone'`, so a container needs the build
output plus a writable volume for the SQLite file. Two things matter:

- **Serve over HTTPS.** Session cookies use the `__Host-` prefix in production,
  which browsers reject without it. You will not be able to sign in over plain
  HTTP.
- **Keep `DATABASE_PATH` on a persistent volume.** It is the whole database.

---

## How it is put together

```
src/
├─ proxy.ts              per-request CSP with a nonce
├─ app/                  routes only — no business logic
│  ├─ r/[slug]/          the customer kiosk
│  ├─ admin/             login + (dashboard) route group
│  └─ api/               the public feedback endpoints
├─ components/           ui/ primitives · review/ kiosk · admin/ dashboard
├─ server/               everything that must never reach the browser
│  ├─ db/                connection + ordered migrations
│  ├─ auth/              sessions, CSRF, route guards
│  ├─ security/          hashing, passwords, rate limiting, request context
│  ├─ repositories/      SQL lives here, and only here
│  ├─ services/          use cases that span repositories
│  ├─ actions/           server actions — the mutation boundary
│  └─ validation/        Zod schemas for every untrusted input
├─ lib/                  pure helpers, safe on both sides
└─ types/                shared domain types
```

The dependency rule is one-directional:

```
route ─▶ action / handler ─▶ service ─▶ repository ─▶ database
              │
              └─▶ validation (Zod)   ─ every untrusted value, before anything else
```

A route never writes SQL. A repository never reads a cookie. Anything under
`server/` imports `server-only`, so a stray import into a client component is a
build error rather than a leak.

---

## Documentation

| Document | What is in it |
| --- | --- |
| [`docs/01-architecture.md`](docs/01-architecture.md) | Layers, request flows, why SQLite |
| [`docs/02-security-architecture.md`](docs/02-security-architecture.md) | Every control, and the reasoning behind each |
| [`docs/03-threat-model.md`](docs/03-threat-model.md) | STRIDE analysis, attacker goals, accepted risks |
| [`docs/04-data-model.md`](docs/04-data-model.md) | Tables, relationships, retention, GDPR posture |
| [`docs/05-design-system.md`](docs/05-design-system.md) | Tokens, motion rules, component conventions |
| [`docs/06-operations.md`](docs/06-operations.md) | Deploying, backups, incident response |
| [`SECURITY.md`](SECURITY.md) | How to report a vulnerability |

---

## Licence

MIT. See [`LICENSE`](LICENSE).
