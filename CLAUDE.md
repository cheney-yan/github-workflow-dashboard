# CLAUDE.md

Guidance for agents working in this repository.

## Commands

- `npm run dev` — development server on <http://localhost:3000>
- `npm run build` — production build (webpack; Turbopack's native binding is blocked on some Windows hosts)
- `npm start` — serve the production build
- `npm run lint` / `npm run typecheck`
- `npm test` / `npm run test:coverage`
- `npm run audit:prod` — production dependency audit (must stay clean)

Run the full gate with:

```bash
npm run lint && npm run typecheck && npm test -- --ci && npm run build
```

Docker gate (Linux, matches CI):

```bash
docker run --rm -v "$PWD:/app" -v gwm_node_modules:/app/node_modules \
  -w /app node:24-alpine sh -c "npm ci && npm run lint && npm run typecheck && npm test -- --ci && npm run build"
```

## Architecture

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui on Radix.
The dashboard is client-heavy; a small Node route-handler layer provides local
account login, session cookies, per-user encrypted GitHub tokens and health
checks.

Context hierarchy in `src/app/layout.tsx`:

`Theme → DisplaySettings → GitHubToken → RepositorySelection → Workflow`

- `src/contexts/github-token-context.tsx` — validates the PAT, stores it
  encrypted, exposes `userId`, `scopes`, `rateLimit`.
- `src/contexts/repository-selection-context.tsx` — organizations, repository
  list, per-repository workflow activity, persisted selection.
- `src/contexts/workflow-context.tsx` — one `actions/runs` request per
  repository; derives per-workflow histories and repository metrics; auto-refresh
  with jitter and a concurrency cap.
- `src/lib/api/github.ts` — the only GitHub API client. Validates and encodes
  owner/repo names, sets timeouts, retries idempotent failures, captures scopes
  and rate limits.
- `src/lib/workflow-metrics.ts` — pure timing/health calculations. Add tests here
  whenever the formulas change.
- `src/lib/format.ts` — duration/relative-time formatting.
- `src/lib/workflow-filters.ts` — status + "Only me" run filtering.
- `src/components/workflow-dashboard.tsx` — thin orchestrator. Presentation lives
  in `dashboard-header.tsx`, `dashboard-summary.tsx`,
  `repository-workflow-card.tsx`, `compact-workflow-grid.tsx`,
  `repository-row.tsx`, `workflow-jobs.tsx`, `runner-utilization.tsx` and
  `workflow-stats.tsx`.
- `src/lib/alerts.ts` + `src/hooks/use-workflow-alerts.ts` — pure alert rules and
  browser-notification delivery (deduplicated per run).
- `src/components/insecure-context-banner.tsx` — HTTP-only warning; the app must
  still render and work behind a TLS reverse proxy.
- `src/app/api/health/route.ts`, `src/instrumentation.ts`, `src/middleware.ts` —
  health/version endpoint, startup/error logs and the request access log. Keep
  logs JSON lines and never include tokens or query strings.
- `src/app/settings/components/` — token, display, instructions and security
  sections; the page only composes them.
- `src/lib/auth/store.ts` — users, scrypt password hashes, AES-256-GCM token
  encryption and the JSON store under `DATA_DIR`.
- `src/lib/auth/session.ts` — HMAC-signed session cookie, origin/HTTPS checks.
- `src/app/api/auth/*` — login, logout, me, change-password, token and admin user
  creation. Routes enforce the session; the client gate is only cosmetic.
- `src/contexts/auth-context.tsx` + `src/components/auth-gate.tsx` — login state
  and route gating.
- `src/app/login/page.tsx` — sign-in and forced first-login password change.
- `src/lib/storage/secure-storage.ts` — public encrypted browser storage API;
  `storage-crypto.ts` holds the IndexedDB, HKDF and AES-256-GCM primitives.
  Never persist a token in plaintext.

## Conventions

- Prefer React text interpolation; do not add `dangerouslySetInnerHTML`.
- Do not add CDN scripts, styles or fonts. Every asset must be bundled and served
  from the app origin; icons come from `lucide-react`, not an external sprite.
- Any new network host must be added to `connect-src` in `next.config.ts` and
  justified in the PR.
- External links need `rel="noopener noreferrer"`.
- Tests live in `__tests__/` and must match `*.test.ts(x)`. Do not add standalone
  scripts that call `process.exit` there.
- The Docker image must stay non-root and keep working with a read-only root
  filesystem.
- Security-relevant changes also update `docs/SECURITY-AUDIT.md`.
