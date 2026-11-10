/**
 * Runs once when the Node server starts and on unhandled request errors.
 * Structured JSON lines are easy to read with `docker compose logs` and to
 * forward to a log collector later.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  console.log(JSON.stringify({
    level: 'info',
    event: 'startup',
    service: 'github-workflow-monitor',
    version: process.env.APP_VERSION || 'dev',
    commit: process.env.GIT_COMMIT || 'unknown',
    node: process.version,
    env: process.env.NODE_ENV || 'unknown',
    port: process.env.PORT || '3000',
  }));
}

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string; routeType?: string }
) {
  console.error(JSON.stringify({
    level: 'error',
    event: 'request_error',
    path: request?.path,
    method: request?.method,
    routerKind: context?.routerKind,
    routePath: context?.routePath,
    routeType: context?.routeType,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }));
}
