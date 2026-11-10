import { NextResponse } from 'next/server';
import { currentUser, hasSecureTransport, jsonError, sameOrigin } from '@/lib/auth/session';
import { createUser, listUsers } from '@/lib/auth/store';
import { validatePassword, validateUsername } from '@/lib/auth/policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(request: Request) {
  if (!sameOrigin(request)) return { user: null, error: jsonError('Invalid origin', 403) };
  if (!hasSecureTransport(request)) return { user: null, error: jsonError('HTTPS is required', 403) };
  const user = await currentUser(request);
  if (!user) return { user: null, error: jsonError('Unauthorized', 401) };
  if (!user.isAdmin) return { user: null, error: jsonError('Admin access required', 403) };
  if (user.mustChangePassword) {
    return { user: null, error: jsonError('Change your password first', 403) };
  }
  return { user, error: null };
}

export async function GET(request: Request) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const username = (body.username || '').trim();
  const password = body.password || '';
  const usernameError = validateUsername(username);
  if (usernameError) return jsonError(usernameError, 400);
  const passwordError = validatePassword(password);
  if (passwordError) return jsonError(passwordError, 400);

  try {
    const user = await createUser(username, password, false);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Failed to create user', 400);
  }
}
