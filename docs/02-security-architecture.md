# Security architecture

This document states what Leva defends, how, and where each control lives in the
code. The reasoning matters more than the list: a control nobody understands is
a control the next person deletes.

---

## 1. What is actually at stake

Leva is a small application, but it is not low-risk, because three of its assets
are attractive on their own:

| Asset | Why an attacker wants it | Worst realistic outcome |
| --- | --- | --- |
| The Google review link | It is a link every customer taps, on a screen they trust | A phishing page served under the shop's own QR code |
| The feedback record | It decides who gets praised and who gets managed out | Fabricated ratings; a real employee harmed |
| Customer comments | Free text, written in confidence | Re-identification of a complaining customer |
| The admin session | Full control of all of the above | Total compromise, silently |

The single unauthenticated write endpoint — `POST /api/feedback` — is the widest
part of the attack surface, and most of the design below exists because of it.

---

## 2. Trust boundaries

```
       untrusted                    │  semi-trusted    │   trusted
 ─────────────────────────────────  │ ──────────────── │ ────────────────
  customer phone (any browser)      │                  │
  QR / NFC tag contents             │                  │
  scripted client, curl, bot        │                  │
        │                           │                  │
        ▼                           │                  │
   ┌─────────────────┐              │                  │
   │  src/proxy.ts   │  CSP + nonce │                  │
   └────────┬────────┘              │                  │
            ▼                       │                  │
   ┌──────────────────────┐         │                  │
   │ validation (Zod)     │◀── every untrusted value crosses here, once
   └────────┬─────────────┘         │                  │
            ▼                       │                  │
   ┌──────────────────────┐    ┌────┴───────────┐  ┌───┴─────────────┐
   │ services             │    │ admin session  │  │ SQLite file     │
   │ (rate limit, tokens) │    │ (authenticated)│  │ env secrets     │
   └────────┬─────────────┘    └────────────────┘  └─────────────────┘
            ▼
   ┌──────────────────────┐
   │ repositories (SQL)   │  parameterised statements only
   └──────────────────────┘
```

An administrator is **semi-trusted**, not trusted. They can be phished, and
their laptop can be stolen. That is why admin actions are rate-limited, audited,
and why the one URL they control that every customer sees — the Google link — is
constrained to an allowlist rather than accepted as typed.

---

## 3. Controls

### 3.1 Authentication

| Control | Where | Why this way |
| --- | --- | --- |
| scrypt, N=2^16, r=8, 64 MiB | `server/security/password.ts` | Memory-hard, so GPU and ASIC farms lose their advantage. In Node's standard library — no native build, no extra supply-chain surface. ~100 ms per hash: invisible at login, a 10^5 multiplier for an offline cracker. |
| Encoded parameters (`scrypt$N$r$p$salt$hash`) | same | Cost can be raised later without a flag day. `needsRehash()` upgrades a hash transparently on the owner's next successful login. |
| NFKC normalisation | same | The same passphrase typed on a different keyboard produces different bytes otherwise, and the user is locked out of their own account. |
| Constant-time comparison | `security/hash.ts` | `===` on secrets leaks their prefix through timing. Both sides are hashed first so length never leaks either. |
| Dummy verification on unknown email | `services/auth-service.ts` | Without it a miss returns in microseconds and a hit in ~100 ms — a free, reliable list of which emails have accounts. |
| Identical message for every failure | `actions/auth-actions.ts` | "No such account" versus "wrong password" is the same enumeration oracle, in words. |
| Lockout after 8 failures, 15 min | `repositories/users.ts` | Stops many attackers converging on one account. Complements the per-IP limit, which stops one attacker spraying many accounts. |

**Password policy is length-only** (12 characters minimum, 128 maximum, no
composition rules). Per NIST SP 800-63B: composition rules push people towards
`Password1!` and its cousins, which are exactly what a cracking dictionary
contains. The 128-character cap exists so a multi-megabyte "password" cannot be
used to make the server burn 64 MiB of scrypt memory per request.

### 3.2 Sessions

| Property | Value | Reasoning |
| --- | --- | --- |
| Token | 256 bits, CSPRNG | Not guessable. Not derived from anything. |
| Storage | SHA-256 digest only | A database dump yields nothing replayable. Plain SHA-256 is right here: the input already has 256 bits of entropy, so there is nothing to brute-force and stretching would only cost latency. |
| Cookie | `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax` | `__Host-` is the strongest prefix the platform offers: the browser refuses the cookie unless it is Secure, `Path=/` and has no `Domain`, so a sibling subdomain cannot set or overwrite it. |
| Idle timeout | 8 hours | A phone left on the counter stops being a way in. |
| Absolute timeout | 7 days | A stolen cookie has a hard expiry no amount of activity can extend. |
| Rotation | New session id on every login | Session fixation depends on the server adopting an id the client already had. It never does. |
| Revocation | All sessions dropped on password change | Otherwise changing a leaked password leaves the attacker signed in — the exact case the change was meant to fix. |

`SameSite=Lax` rather than `Strict` is deliberate: `Strict` breaks the redirect
back from an external link and teaches people to work around it, while still
blocking the cross-site POSTs that CSRF actually needs.

### 3.3 Cross-site request forgery

Two independent checks, both required (`server/auth/csrf.ts`):

1. **Origin / Referer must equal `APP_ORIGIN`.** Browsers set these and page
   script cannot override them.
2. **Token match.** A 256-bit token is bound to the session row; the readable
   half is submitted with every form and compared in constant time.

One check would do for the textbook attack. Both are here because a forged
request could repoint the Google link — turning the shop's own printed QR code
into a phishing funnel — and that is worth surviving a misconfigured CORS
policy or a proxy that rewrites `Origin`.

Every admin form goes through `components/admin/form.tsx`, which injects the
token. Centralising it means a new form cannot forget it — the kind of omission
that passes review and shows up in a pen test.

The login form is the exception: there is no session yet to bind a token to, so
it relies on the Origin check alone. That is sufficient, because a forged login
cannot read the response and cannot log the victim into the attacker's account
(the session is minted fresh after authentication, never adopted).

### 3.4 Abuse of the public endpoint

The feedback endpoint is unauthenticated by necessity — customers do not have
accounts. Five layers stand in for authentication:

1. **Single-use visit tokens** (`repositories/visit-tokens.ts`). The kiosk page
   mints one per render; submitting burns it. The `used_at IS NULL` guard is
   *inside* the `UPDATE`, so two concurrent submissions race in SQLite and
   exactly one wins — a separate `SELECT` would leave a window open.
2. **Rate limiting** (`security/rate-limit.ts`), per hashed IP, with separate
   budgets for minting tokens and spending them. Without the first, the page
   itself becomes the faucet feeding a flood.
3. **Honeypot field** — hidden from people and assistive tech, attractive to a
   bot that fills every input it finds.
4. **Timing floor** — under 1.2 seconds is not a human reading three screens.
5. **Server-side re-derivation.** The team member a rating lands on comes from
   the *token*, not the request body, whenever the tag was person-specific. A
   client cannot file a rating against someone else. Suggestion ids are
   re-checked against live rows, so a chip that was deleted cannot be revived.

Rejections are deliberately vague. A bot that learns which check caught it is a
bot that gets tuned to pass next time.

### 3.5 Injection

| Vector | Control |
| --- | --- |
| SQL | Parameterised statements only, everywhere. Repositories are the only files with SQL, so this is auditable with one `grep`. No string interpolation of values anywhere — the only interpolation is a fixed `WHERE` fragment built from an internal enum. |
| XSS | React escapes by default and `dangerouslySetInnerHTML` appears nowhere in the codebase. Backed by CSP with a per-request nonce and `strict-dynamic`. |
| Open redirect | The Google link is constrained to an allowlist of Google hostnames, matched on the **whole** hostname (so `g.page.evil.com` fails). The second-platform link cannot be host-allowlisted, so it is constrained to `https:`, which rules out `javascript:`, `data:` and `file:`. Both are named explicitly in the audit trail. |
| Header / log injection | Control characters are stripped from every free-text field before storage. |
| Path traversal | The store slug is `^[a-z0-9]+(-[a-z0-9]+)*$` and is never used as a filesystem path. |

### 3.6 Response headers

Static headers are declared in `next.config.ts` so the edge applies them without
running JavaScript. The CSP carries a per-request nonce, so it is built in
`src/proxy.ts`.

```
default-src 'self'
script-src  'self' 'nonce-<random>' 'strict-dynamic'
style-src   'self' 'unsafe-inline'
img-src     'self' data: blob:
connect-src 'self'
frame-ancestors 'none'
form-action 'self'
base-uri 'self'
object-src 'none'
upgrade-insecure-requests
```

`strict-dynamic` means: trust what this nonce loads, ignore any host allowlist.
An injected `<script src="evil.com">` is blocked without anyone maintaining a
domain list that goes stale.

`form-action 'self'` is the quiet one that matters: it stops an injected
`<form action="https://evil">` from exfiltrating whatever the customer typed.

Alongside: HSTS (2 years, preload-eligible), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Cross-Origin-Opener-Policy: same-origin`, and a `Permissions-Policy` that denies
every powerful feature — with NFC re-enabled on `/admin/tags` alone, the one page
that needs it.

**Accepted residual:** `style-src 'unsafe-inline'`. Next emits small inline
`<style>` blocks it does not nonce. The exposure is low because the app renders
no user-controlled markup anywhere, so there is no injection point for a style
payload. Tracked in [`03-threat-model.md`](03-threat-model.md).

### 3.7 Privacy by design

No customer identity is collected. No name, no email, no phone, no account.

| Field | Treatment |
| --- | --- |
| IP address | Never stored raw. HMAC-SHA-256 with `IP_HASH_SECRET`, truncated to 22 characters. A plain hash would be pointless — all of IPv4 can be brute-forced in seconds — so the pepper is what makes it irreversible. Rotating the secret orphans every stored value. |
| User agent | Reduced to a family (`ios`, `android`, `windows`, …). The full string is a strong fingerprint we have no use for. |
| Comments | The only free text with re-identification risk. `redactOldComments()` clears them and their IP hash on a retention schedule. |
| Google click | We record *that* the customer tapped through. Whether they wrote a review, and what it said, is between them and Google. The dashboard says "opened Google", never "reviewed". |

Ratings are kept indefinitely, because aggregate history is the point of the
product and a rating alone identifies nobody.

### 3.8 Auditability

`audit_log` is append-only. There is no update path and no delete path — an
audit trail an administrator can rewrite is not an audit trail. It records the
actor, the action, the target, a short human summary, and a hashed IP. It never
records the secret that changed.

Failed and blocked sign-ins are logged too, and rendered in red on
`/admin/activity`, because a burst of them is the earliest visible sign of an
attack in progress.

### 3.9 Supply chain and configuration

- `npm audit` is clean at the pinned versions; Next is pinned to a release
  patched for CVE-2025-66478.
- Exact versions in `package.json` and a committed lockfile: builds are
  reproducible, and a compromised patch release cannot arrive silently.
- Runtime dependencies are four: `next`, `react`, `better-sqlite3`, `zod`, plus
  `qrcode`. Password hashing and all cryptography use Node's standard library.
- `src/lib/env.ts` parses the environment **eagerly** at boot. A production
  server with an empty `SESSION_SECRET` fails to start rather than signing every
  cookie with `""`.
- `.gitignore` excludes `.env*`, `data/` and `*.db`.

---

## 4. What is deliberately not done

| Not implemented | Why | When to revisit |
| --- | --- | --- |
| Multi-factor authentication | One or two admins on a small shop app; TOTP enrolment and recovery codes are real complexity and a real support burden | Before a multi-tenant version, or any deployment with more than a handful of admins |
| Distributed rate limiting (Redis) | Limits live in SQLite and hold across instances sharing the file. Fine for one shop | When the app runs on more than one node with separate storage |
| CSP violation reporting | Needs an endpoint and somewhere to send it | When there is somewhere to send it |
| Encryption at rest | The host's disk encryption is the right layer; application-level encryption of a file the app must read gains little | If the database ever leaves a controlled host |
| Field-level encryption of comments | The retention sweep is a better fit for the actual risk | If comments ever become identifiable |

---

## 5. Verifying it

```bash
npm test                       # password, token, rate-limit and validation behaviour
npm audit                      # dependency advisories
npm run build                  # type errors are build errors
curl -I https://your-host/     # confirm the headers above are present
```

Report a vulnerability per [`SECURITY.md`](../SECURITY.md).
