# Contributing

Thanks for improving GitHub Workflow Monitor.

## Development

Requirements: Node.js 22+ (Node 24 is used in CI) and npm 10+.

```bash
npm ci
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

Run everything the CI runs:

```bash
npm run lint && npm run typecheck && npm test -- --ci --coverage && npm run build
```

### Docker

```bash
docker compose up --build
# or, with the published image
docker compose pull && docker compose up
```

The container is read-only and drops all capabilities. If you add a feature that
needs to write to disk, mount a tmpfs explicitly.

## Workflow

1. Never commit directly to `main`; create a feature branch.
2. Keep changes focused and add tests for behaviour changes.
3. Run the full local check list above.
4. Open a pull request and fill in the template.
5. CI must be green. A CodeRabbit review is requested automatically where the
   repository is configured; fix blocking findings before merging.

## Commit style

Use short imperative subjects (`add queue-time metrics`), and explain *why* in the
body when the change is not obvious.

## Security

Do not paste real GitHub tokens into issues, tests, or screenshots. Report
vulnerabilities through the process in [SECURITY.md](SECURITY.md), not in a public
issue.
