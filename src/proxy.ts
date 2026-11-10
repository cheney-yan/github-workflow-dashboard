import { NextResponse, type NextRequest } from 'next/server';

/**
 * Lightweight access log for page/API requests. Static assets and the health
 * endpoint are excluded to keep container output useful. Query strings are
 * never logged.
 */
export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const path = request.nextUrl.pathname;

  const response = NextResponse.next();
  response.headers.set('x-request-id', requestId);

  if (path !== '/api/health') {
    console.log(JSON.stringify({
      level: 'info',
      event: 'request',
      requestId,
      method: request.method,
      path,
      forwardedProto: request.headers.get('x-forwarded-proto') || null,
      durationMs: Date.now() - started,
    }));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
