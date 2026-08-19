# Security policy

## Reporting a vulnerability

Report privately. Do not open a public issue.

- Open a [private security advisory](https://github.com/laarrbbi/leva/security/advisories/new), or
- email the repository owner.

Please include: what you found, how to reproduce it, and what an attacker gains.
A proof of concept helps.

You will get an acknowledgement within 3 working days and an assessment within
7. Please give 90 days before public disclosure.

Test only against your own deployment. Do not test against a live shop, and do
not submit fake feedback to someone's real store — that harms a business and the
employees whose ratings it distorts.

## Supported versions

The `main` branch. This is a single-tenant application deployed per shop; there
are no back-ported releases.

## In scope

- Authentication and session handling
- CSRF, XSS, SQL injection, open redirect
- Abuse of the public feedback endpoint (replay, forgery, rate-limit bypass)
- Privilege escalation between the `manager` and `owner` roles
- Leakage of customer data or admin data

## Out of scope

- Anything requiring physical access to the server or its database file
- Anything requiring an already-compromised admin credential, unless it escapes
  a control that is supposed to contain that case (audit logging, the outbound
  link allowlists, admin rate limiting)
- Denial of service by raw traffic volume — that belongs at the edge
- Missing headers on a deployment that is not fronted by TLS
- Findings that only apply with `TRUST_PROXY_HEADERS=1` set without a proxy;
  this is documented as unsafe

## Known accepted risks

Documented, with reasoning, in
[`docs/03-threat-model.md`](docs/03-threat-model.md#risk-register). Reports
matching an entry there are still welcome if you can show the reasoning is
wrong.
