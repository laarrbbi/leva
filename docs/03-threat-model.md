# Threat model

STRIDE, applied to the three things worth attacking in Leva: the review record,
the outbound links, and the admin session.

Scope: the application. Out of scope: the host OS, the TLS terminator, and
Google's own systems.

---

## Attacker profiles

| Who | Capability | What they want |
| --- | --- | --- |
| **Bored customer** | A phone, in the shop | Rate the same visit twenty times; give a colleague one star |
| **Competitor** | A script, from anywhere | Bury the shop in one-star ratings; make the dashboard useless |
| **SEO / review broker** | Automation, at scale | Farm submissions; repoint the Google link at their own funnel |
| **Phisher** | Can reach the admin login, or phish the owner | Replace the outbound link so the shop's printed QR serves their page |
| **Insider (staff)** | A valid tag, physical access | Inflate their own rating; delete a bad one |
| **Curious admin** | A valid session | Identify the customer who wrote a complaint |

---

## S — Spoofing

| Threat | Control | Residual |
| --- | --- | --- |
| Guessing an admin password | scrypt (64 MiB, ~100 ms) + 8-attempt lockout + per-IP limit | A weak, reused password still loses to credential stuffing. No MFA — see [`02`](02-security-architecture.md#4-what-is-deliberately-not-done) |
| Enumerating admin emails | Dummy scrypt run on a miss; one identical error message | None material |
| Replaying a stolen session cookie | `HttpOnly` + `Secure` + `__Host-` + idle and absolute timeouts | A cookie stolen from an unlocked device works until timeout. Mitigated by revocation on password change |
| Session fixation | New session id minted on every login; never adopted from the client | None |
| Submitting feedback as another team member | The team member comes from the **visit token**, not the request body, for person-specific tags | On a generic counter tag the customer picks — which is the intended product behaviour |
| Forging `X-Forwarded-For` to escape rate limits | Proxy headers are ignored unless `TRUST_PROXY_HEADERS=1` | An operator who sets that flag without a proxy in front defeats every limit. Called out in the README |

## T — Tampering

| Threat | Control | Residual |
| --- | --- | --- |
| SQL injection | Parameterised statements only; SQL confined to `repositories/` | None known |
| Repointing the Google link | Hostname allowlist, whole-host match, `https:` only; CSRF; audited | A compromised admin can still point it at a *different Google* page. Bounded and visible in the log |
| Repointing the second-platform link | `https:` only; CSRF; named explicitly in the audit entry | Cannot be host-allowlisted — it is an arbitrary partner URL. This is the largest accepted risk in the app; the audit trail is the compensating control |
| Editing history to hide a bad rating | No update or delete path for feedback exists in the code | An admin with database file access can do anything. Out of scope |
| Rewriting a physical NFC tag in the shop | Operational, not technical: the Tags page tells the owner to lock tags read-only after writing | A tag left writable can be repointed by anyone standing at the counter |
| Tampering with a visit token | Only the SHA-256 digest is stored; a modified token matches nothing | None |

## R — Repudiation

| Threat | Control | Residual |
| --- | --- | --- |
| "I never changed that setting" | Append-only `audit_log` with actor, action, target, summary, hashed IP | An attacker with file access can edit the database directly |
| "I never tried to log in" | Failed and blocked attempts are logged and shown in red | Attribution is to an account and a hashed IP, not a person |

Customer submissions are **intentionally repudiable**. Anonymity is the product
promise; non-repudiation would require identifying the customer, which is
exactly what this application refuses to do.

## I — Information disclosure

| Threat | Control | Residual |
| --- | --- | --- |
| Database dump reveals customer identities | No identity is ever collected. IPs are peppered-hashed and truncated; user agents reduced to a family | A comment can self-identify ("I'm the guy with the red van"). Retention sweep limits the window |
| Session tokens usable from a dump | Only digests are stored | None |
| Enumerating feedback via the click endpoint | `public_id` is 128 random bits; the endpoint returns 204 whether or not it matched | None material |
| Stack traces or version banners | `poweredByHeader: false`; `/api/health` returns one word; errors are generic | None known |
| Search engines indexing a customer's page | `X-Robots-Tag: noindex` plus route metadata | None |
| Referer leaking the tag URL to Google | `Referrer-Policy: strict-origin-when-cross-origin`; `rel="noopener noreferrer"` on the outbound link | None |
| XSS reading the dashboard | React escaping, no `dangerouslySetInnerHTML`, CSP with nonce + `strict-dynamic` | `style-src 'unsafe-inline'` is required by Next. No user-controlled markup exists to exploit it — **accepted** |

## D — Denial of service

| Threat | Control | Residual |
| --- | --- | --- |
| Flooding the feedback endpoint | Per-IP limit on both minting and spending tokens; single-use tokens; 8 KiB body cap | A large botnet with many source IPs. Needs an edge WAF — out of scope |
| Exhausting memory via scrypt | 128-character password cap; login is rate-limited | A distributed login flood still costs CPU |
| Filling the disk | Every free-text field is length-capped; wishes capped at 5 per submission | Sustained abuse still grows the file. Monitor it |
| SQLite write-lock contention | WAL mode, 5 s busy timeout | Single-writer is a real ceiling. See [`01-architecture.md`](01-architecture.md) |

## E — Elevation of privilege

| Threat | Control | Residual |
| --- | --- | --- |
| Reaching admin pages without a session | `requireSession()` in the route-group layout **and** in each page; redirect, never a 403 that confirms the page exists | None known |
| A `manager` performing owner-only actions | `requireOwner()` role gate | Role separation is coarse — two roles, by design |
| Client-supplied ids trusted by the server | Every id is re-validated server-side against live rows; `public_id` is unguessable | None known |
| Server-only code reaching the browser | Every `server/` module imports `server-only`; a stray import fails the build | None |

---

## Risk register

| # | Risk | Likelihood | Impact | Response |
| --- | --- | --- | --- | --- |
| 1 | Admin credential phished (no MFA) | Medium | High | **Accept, monitor.** Audit log surfaces it; password change revokes everything. Revisit for multi-tenant |
| 2 | Second-platform link repointed by a compromised admin | Low | High | **Mitigate.** `https:` only, CSRF, named in the audit entry |
| 3 | `style-src 'unsafe-inline'` | Low | Medium | **Accept.** No user-controlled markup exists to inject through |
| 4 | Distributed submission flood | Low | Medium | **Transfer.** Edge rate limiting at the CDN |
| 5 | Operator sets `TRUST_PROXY_HEADERS=1` with no proxy | Medium | Medium | **Mitigate by documentation.** Defaults to off; warned in README and `.env.example` |
| 6 | Comment self-identifies its author | Medium | Low | **Mitigate.** Retention sweep; no identity stored alongside |
| 7 | Physical NFC tag rewritten in-store | Low | High | **Mitigate by guidance.** Tags page instructs locking tags read-only |
| 8 | SQLite becomes a write bottleneck | Low | Low | **Accept.** Documented migration path to Postgres |

---

## Review triggers

Re-run this analysis when any of these changes:

- Customer identity is collected (name, email, phone, loyalty id)
- A second store or tenant is added
- Payments, ordering, or any money movement enters the product
- The second platform stops being a link and becomes a flow inside this app
- Any third-party script is added to a page
