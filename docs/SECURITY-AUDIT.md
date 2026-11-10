# Security audit — GitHub Workflow Monitor

- **Date:** 2026-11-10
- **Scope:** this repository at the audited commit
  (`src/`, `Dockerfile`, `docker-compose.yaml`, build and CI configuration)
- **Method:** manual source review, dependency audit (`npm audit`), configuration
  review, container inspection, HTTP header checks, and CI scanners (CodeQL,
  Trivy, Gitleaks, OpenSSF Scorecard).
- **Status:** all findings below are fixed in this branch unless explicitly
  marked as accepted risk.

## 1. Summary

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| F-01 | Critical | Next.js 15.5.3 vulnerable to RSC RCE and multiple DoS/bypass advisories | Fixed — Next.js 16.4.6, React 19.3.1 |
| F-02 | High | Token encryption key derived from a predictable browser fingerprint | Fixed — random IndexedDB secret + HKDF + AES-256-GCM + AAD |
| F-03 | High | No CSP / security headers on responses | Fixed — CSP, HSTS, frame denial, COOP/CORP, Permissions-Policy |
| F-04 | High | Container ran as root; unpinned install; whole build context copied | Fixed — non-root, `npm ci`, `.dockerignore`, read-only Compose |
| F-05 | Medium | Stored token prefix shown in the UI; verbose auth logging to console | Fixed — fixed mask, no token/user logging in production |
| F-06 | Medium | Owner/repository names interpolated into API paths without validation | Fixed — allow-list validation and `encodeURIComponent` |
| F-07 | Medium | No request timeout, retry or rate-limit visibility | Fixed — 15 s timeout, one retry, jitter, concurrency cap, quota display |
| F-08 | Medium | Repository pagination could loop without bound | Fixed — hard cap of 20 pages / 2,000 repositories |
| F-09 | Medium | No CI security controls or reproducible builds | Fixed — CI, CodeQL, dependency review, Gitleaks, Scorecard, Trivy, SBOM |
| F-10 | Low | Stored repository JSON trusted without shape validation | Fixed — validated before use |
| F-11 | Low | Stored display settings trusted without validation | Fixed — sanitised and length-limited |
| F-12 | Low | Test suite was entirely red, so regressions were invisible | Fixed — 86 tests, lint, typecheck and build are green |
| F-13 | Info | Client-only architecture had no server-side token store | Superseded — local account service with encrypted per-user token store added |
| F-14 | Low | Theme and last-org preferences stored in plain localStorage | Accepted — non-sensitive data |

Production dependency audit after the upgrade:

```text
$ npm audit --omit=dev --audit-level=high
found 0 vulnerabilities
```

## 2. Detailed findings

### F-01 — Critical: vulnerable Next.js (fixed)

`next@15.5.3` matched `GHSA-9qr9-h5gf-34mp` (React flight protocol RCE, CVSS
10.0) and roughly twenty further advisories covering RSC DoS, middleware bypass,
cache poisoning, SSRF and image-optimizer RCE.

**Fix:** upgraded to `next@16.4.6` and `react@19.3.1`, with the lockfile
committed. The production audit is clean.

### F-02 — High: predictable token encryption key (fixed)

The previous implementation derived the AES key from
`userAgent|language|screen|timezone|constant` with a fixed salt. Anyone who could
read localStorage could derive the same key offline, so the encryption added
almost no protection against a shared-computer or backup-then-dump scenario.

**Fix:** `src/lib/storage/secure-storage.ts` now:

1. Generates a random 256-bit secret with the platform CSPRNG on first use and
   stores it in IndexedDB (not localStorage).
2. Derives a per-item AES-256-GCM key with HKDF-SHA-256 and a random 32-byte
   salt.
3. Uses a fresh 12-byte IV per write and binds the ciphertext to its storage key
   through AES-GCM additional authenticated data, so blobs cannot be swapped
   between keys.
4. Deletes legacy v1 ciphertext on first read instead of decrypting it; that
   scheme was derivable from public browser attributes. Users re-enter the token
   once into the v2 format.
5. Keeps the token in memory only when encrypted persistence is unavailable.

Tests cover round-trip, no plaintext in localStorage, unique IVs, key binding,
tamper detection, malformed payloads, legacy rejection and clearing.

**Residual risk:** same-origin script execution (XSS) can still call the decrypt
function. No browser-only scheme prevents that; the CSP, the absence of
user-controlled HTML and dependency patching are the controls for it.

### F-03 — High: missing browser security policy (fixed)

Responses had no CSP, HSTS, frame protection, referrer policy or
permissions policy, and exposed `X-Powered-By`.

**Fix:** `next.config.ts` sets:

- `Content-Security-Policy` with `default-src 'self'`, `connect-src 'self'
  https://api.github.com`, `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'` and `form-action 'self'`. `upgrade-insecure-requests` is
  deliberately omitted so the HTTP warning page can load its assets; mixed
  content is still blocked by the browser on HTTPS.
- `Strict-Transport-Security` in production.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Resource-Policy: same-origin`,
  `Permissions-Policy` denying camera, microphone, geolocation, payment and USB.
- `poweredByHeader: false`.

`script-src` still needs `'unsafe-inline'` for Next.js bootstrap scripts. There is
no `dangerouslySetInnerHTML` and every remote value is rendered through React,
so the practical injection surface is the dependency supply chain.

### F-04 — High: weak container defaults (fixed)

The image ran as root, used `npm install --frozen-lockfile` (a Yarn flag that npm
does not enforce) and copied the whole context, including local secrets and
`.next` output.

**Fix:**

- Multi-stage build with `npm ci` and Node 24 Alpine.
- `output: "standalone"` in Next.js; only the standalone server, static assets
  and public files are copied.
- Runs as UID 1001 (`nextjs`), not root.
- `HEALTHCHECK` built in.
- `.dockerignore` excludes VCS data, tests, docs, logs and env files.
- Compose runs the container read-only, drops all capabilities, sets
  `no-new-privileges`, and mounts writable paths only as tmpfs.
- CI publishes multi-arch images with SBOM, provenance and a Trivy gate.

### F-05 — Medium: token material on screen and in logs (fixed)

Settings displayed `token.slice(0, 8)`, leaking part of the secret to anyone
looking at the screen. The token context also logged token presence and
validation details to the console on every load.

**Fix:** the stored token is rendered as a fixed 16-dot mask with an explicit
`aria-label`. Validation errors are shown, but token values, user identity and
auth events are no longer logged. Scope and quota display comes from the API
response headers, not from the secret.

### F-06 — Medium: API path construction (fixed)

`/repos/${owner}/${repo}` used values from the API and storage without checks.
A tampered repository entry or a malformed name could alter the request path.

**Fix:** `isValidGitHubName()` enforces GitHub's character set
(`[A-Za-z0-9._-]`, no `.`/`..`, max 100 chars), and every path segment is
`encodeURIComponent`-encoded. Requests use `redirect: 'error'`, so the bearer
token is never forwarded if GitHub responds with a redirect.

Tests cover `../`, `/`, spaces and over-long names.

### F-07 — Medium: resilience and rate limits (fixed)

Every repository was fetched in parallel every interval with no timeout, retry
or quota display, which could burn a token's quota or leave the UI hanging.

**Fix:**

- 15-second timeout per request and one retry for network errors and 502/503/504.
- `403` with `X-RateLimit-Remaining: 0` produces a reset-time message.
- At most four repositories are fetched concurrently.
- Auto-refresh adds ±10% jitter and pauses while the tab is hidden.
- Overlapping refreshes are suppressed.
- The fleet strip shows the remaining GitHub API quota.
- The number of runs per repository is capped at 50; the page count at 20.

### F-08 — Medium: unbounded pagination (fixed)

The repository loop fetched pages until a short page was returned, with no upper
bound. A misbehaving API or proxy could make the client loop indefinitely.

**Fix:** the loop is capped at 20 pages (2,000 repositories per owner).

### F-09 — Medium: supply-chain and CI controls (fixed)

There were no GitHub Actions at all, so nothing checked dependencies, secrets,
code patterns or the published image.

**Fix:** see the workflow table in the README. The Docker workflow builds for
`linux/amd64` and `linux/arm64`, signs provenance, generates an SBOM, scans the
pushed digest with Trivy and fails on CRITICAL/HIGH findings with an available
fix. Dependabot covers npm, Actions and Docker.

### F-10 / F-11 — Low: persisted data validation (fixed)

Selected repositories and display settings were parsed from storage and used
directly. Both are now shape-checked; the dashboard name is trimmed and limited
to 80 characters, the refresh interval must be one of the offered values, and a
repository must have an id, name, full name and owner.

### F-12 — Low: the test baseline was broken (fixed)

Before this change, all 15 entries under `__tests__/` were collected by Jest but
most were standalone console scripts that called `process.exit`. Every suite
failed, `tsc --noEmit` failed, and CI could never have been green.

**Fix:** removed the fake suites, replaced them with five real suites
(86 tests), and configured Jest to collect only `*.test.ts(x)`. Lint, typecheck,
tests and the production build now pass from a clean Linux install.

## 3. Verification performed

```text
$ npm audit --omit=dev --audit-level=high
found 0 vulnerabilities

$ npm run lint && npm run typecheck && npm test -- --ci
Test Suites: 5 passed, 5 total
Tests:       86 passed, 86 total

$ npm run build
✓ Compiled successfully
Route (app): /, /_not-found, /settings
```

The container was built and run with the Compose hardening flags
(`--read-only`, `--cap-drop ALL`, `no-new-privileges`, non-root user). A request
to `/` returned `200` and the following headers:

```text
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

The image scan result is in [`trivy-image.json`](trivy-image.json). Alpine OS
packages: 0 HIGH/CRITICAL. Trivy also reports six HIGH advisories against
`undici` and `brace-expansion` copies vendored inside the Next.js compiled
runtime. They cannot be upgraded independently of Next.js; the current release
(16.4.6) is the latest and the affected code paths are not exposed by this app
(no outbound requests to attacker-controlled hosts, no user-supplied globs).
They are documented with an expiry in [`.trivyignore`](../.trivyignore) so the
gate turns red again after 2027-02-01 or after the next Next.js upgrade.

A source scan confirms there are no external CSS, JavaScript or font URLs:
Tailwind, React, Radix, Lucide and all fonts are bundled and served from the app
origin. The only outbound runtime connection is `https://api.github.com`.

## 4. Independent Cloudflare skill audit

A second pass used the Cloudflare `security-audit-skill`
(standard profile, 19 coverage units). Validators reported `PASS: 19 coverage
units valid` and `PASS: 14 findings valid`. Audit artifacts were kept outside
the repository.

| Result | Finding | Status in this branch |
| --- | --- | --- |
| Medium | Legacy v1 token blobs could be decrypted from public browser attributes | Fixed: v1 blobs are deleted, never decrypted |
| Low | Removing the token left `SELECTED_REPOSITORIES` readable and in memory | Fixed: the key is removed and selection is cleared on identity change |
| Low | Workflow actions use mutable tags; build job has package/attestation write | Accepted: Dependabot updates Actions; add SHA pinning if the repo becomes high-value |
| Low | Trivy scanned after push and lacked `.trivyignore` in its workspace | Fixed: one job scans the exact local image before any push |
| Needs validation | Compose exposed the PAT UI on all interfaces over plain HTTP | Mitigated: Compose now binds `127.0.0.1`; TLS remains a deployment responsibility |
| Needs validation | Six Next.js-vendored advisories are suppressed with an expiry | Accepted with expiry in `.trivyignore`; re-check each Next.js upgrade |

Rejected candidates: owner/repo path traversal, `pull_request_target` execution,
CSP `unsafe-inline` XSS, prototype pollution via stored JSON, `javascript:` URL
XSS, container root, metrics divide-by-zero, plaintext token in localStorage.

## 5. Authentication layer (post-audit)

The dashboard now has a local account service:

- First sign-in is `admin` / `changeme`; a new password is forced before the
  dashboard or token endpoints become available.
- Passwords use scrypt with a random 16-byte salt. Login is rate-limited per
  IP/username and requires HTTPS (localhost excepted).
- Sessions use an HMAC-signed, HttpOnly, SameSite=Lax cookie. Mutating endpoints
  also check the request origin.
- Each user's GitHub token is encrypted with AES-256-GCM (AAD bound to the user
  id) in `data/users.json`; the key is `data/server.key` or `APP_SECRET`.
- Admins can create users in Settings; new users change their password on first
  sign-in.
- `DATA_DIR` must be a persistent, private volume. Back up `users.json` **and**
  `server.key`; losing the key loses the stored tokens. The file and key are
  created mode `0600`.

Residual: there is no email password reset, and changing a password does not
invalidate other already-issued stateless session cookies (they expire after
seven days).

## 6. Residual risks and accepted trade-offs

| Risk | Why it remains | Mitigation |
| --- | --- | --- |
| XSS can decrypt the token | Any script on the origin can call the storage module | CSP, React escaping, no user HTML, pinned deps, self-hosting |
| `'unsafe-inline'` in `script-src` | Next.js injects inline bootstrap scripts | Move to a nonce-based CSP if the app gains user-generated HTML |
| Queue estimates are heuristic | GitHub does not expose a per-run queue prediction | Median of the last 50 runs; label says "est."; stale warnings at 45 min |
| No server-side revocation | Tokens are user PATs | Short expirations, fine-grained scopes, "Remove" button, browser profile separation |
| Browser storage is origin-bound | Clearing site data removes the key | User re-enters the token; this is expected and documented |
| Base image CVEs | Upstream Alpine/Node packages | Dependabot alerts, Trivy gate on every publish |
| Next.js vendored undici/brace-expansion advisories | Cannot be patched outside Next.js | Ignored with expiry in `.trivyignore`; re-check on every Next.js upgrade |
| TypeScript 7 held back | `typescript-eslint` hard-fails on TS 7.0 | Stay on TS 6.0.3; Dependabot ignores the major until the lint stack supports it |

## 7. Recommendations for operators

1. Self-host behind HTTPS. HSTS is sent by the app, but TLS terminates at your
   proxy.
2. Restrict egress to `api.github.com` if the network policy allows it.
3. Use a dedicated fine-grained token with read-only `Actions` and `Contents`
   access; rotate it on a schedule.
4. Keep the image on a digest or a trusted tag and let Dependabot update it.
5. Monitor the CodeQL, Trivy and Scorecard results in the repository Security
   tab.
