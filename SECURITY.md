# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

1. Open a private advisory at
   <https://github.com/cheney-yan/github-workflow-dashboard/security/advisories/new>, or
2. Email the maintainer listed on the GitHub profile.

Include reproduction steps, affected version/commit, and impact. You can expect an
initial response within 7 days. Please allow a reasonable disclosure window while a
fix is prepared.

## Scope

This is a Next.js application with a small local account service. The browser
talks directly to `https://api.github.com`; the server stores each user's GitHub
token encrypted at rest and exposes it only to that user's signed session.

In scope:

- Cross-site scripting (XSS) or HTML injection
- Token disclosure (localStorage, IndexedDB, DOM, logs, referrer)
- Authentication/authorisation flaws in the client
- Container escape or privilege issues in the published image
- Dependency vulnerabilities that are reachable at runtime
- Supply-chain issues in the build and release workflows

Out of scope:

- GitHub platform vulnerabilities (report to GitHub)
- Attacks that require an already-compromised browser profile or extension with
  full host access
- Self-XSS requiring the victim to paste attacker code into DevTools

## Design notes

- The GitHub token is encrypted with AES-256-GCM. The key is derived (HKDF) from a
  random 256-bit secret kept in IndexedDB; localStorage only ever receives
  authenticated ciphertext.
- Security headers (CSP, HSTS, `X-Frame-Options`, `Permissions-Policy`, COOP/CORP)
  are set in `next.config.ts`.
- The container runs as a non-root user with a read-only root filesystem in
  `docker-compose.yaml`.
- CI runs lint, typecheck, tests, a production build, CodeQL, dependency review,
  Gitleaks, OpenSSF Scorecard, and a Trivy scan of the published image.

The full audit, including residual risks, is in
[`docs/SECURITY-AUDIT.md`](docs/SECURITY-AUDIT.md).
