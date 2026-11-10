import { NextResponse } from 'next/server';
import { findUserByUsername, verifyPassword } from '@/lib/auth/store';
import { createSessionValue, hasSecureTransport, jsonError, sameOrigin, sessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';

const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request, username: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${forwarded || 'local'}:${username.toLowerCase()}`;
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 5 * 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError('Invalid origin', 403);
  if (!hasSecureTransport(request)) {
    return jsonError('HTTPS is required to sign in. Use the HTTPS endpoint.', 403);
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const username = (body.username || '').trim();
  const password = body.password || '';
  if (!username || !password) return jsonError('Username and password are required', 400);

  const key = clientKey(request, username);
  if (rateLimited(key)) return jsonError('Too many login attempts. Try again later.', 429);

  const user = await findUserByUsername(username);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return jsonError('Invalid username or password', 401);
  }

  attempts.delete(key);
  const response = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      mustChangePassword: user.mustChangePassword,
      hasToken: Boolean(user.githubToken),
    },
  });
  const cookie = sessionCookie(request, await createSessionValue(user.id));
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
