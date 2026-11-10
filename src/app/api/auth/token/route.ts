import { NextResponse } from 'next/server';
import { currentUser, hasSecureTransport, jsonError, sameOrigin } from '@/lib/auth/session';
import { getUserToken, setUserToken } from '@/lib/auth/store';
import { isValidTokenFormat } from '@/lib/api/token-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authorizedUser(request: Request) {
  if (!hasSecureTransport(request)) {
    return { user: null, error: jsonError('HTTPS is required for token access', 403) };
  }
  const user = await currentUser(request);
  if (!user) return { user: null, error: jsonError('Unauthorized', 401) };
  if (user.mustChangePassword) {
    return { user: null, error: jsonError('Change your password first', 403) };
  }
  return { user, error: null };
}

export async function GET(request: Request) {
  const { user, error } = await authorizedUser(request);
  if (error || !user) return error;
  return NextResponse.json({ token: await getUserToken(user) });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return jsonError('Invalid origin', 403);
  const { user, error } = await authorizedUser(request);
  if (error || !user) return error;

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const token = (body.token || '').trim();
  if (!token || !isValidTokenFormat(token)) {
    return jsonError('Invalid GitHub token format', 400);
  }

  await setUserToken(user.id, token);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return jsonError('Invalid origin', 403);
  const { user, error } = await authorizedUser(request);
  if (error || !user) return error;
  await setUserToken(user.id, null);
  return NextResponse.json({ ok: true });
}
