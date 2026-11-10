import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness/readiness endpoint for Docker, reverse proxies and uptime checks.
 * It intentionally contains no secrets or GitHub data.
 */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'github-workflow-monitor',
    version: process.env.APP_VERSION || 'dev',
    commit: process.env.GIT_COMMIT || 'unknown',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
