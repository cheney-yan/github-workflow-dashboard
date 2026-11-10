import { NextResponse } from 'next/server';
import { currentUser, hasSecureTransport, jsonError, sameOrigin } from '@/lib/auth/session';
import { changePassword, verifyPassword } from '@/lib/auth/store';
import { validatePassword } from '@/lib/auth/policy';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError('Invalid origin', 403);
  if (!hasSecureTransport(request)) return jsonError('HTTPS is required', 403);
  const user = await currentUser(request);
  if (!user) return jsonError('Unauthorized', 401);

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const currentPassword = body.currentPassword || '';
  const newPassword = body.newPassword || '';
  const policyError = validatePassword(newPassword);
  if (policyError) return jsonError(policyError, 400);
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    return jsonError('Current password is incorrect', 403);
  }
  if (currentPassword === newPassword) {
    return jsonError('Choose a different password', 400);
  }

  await changePassword(user.id, newPassword);
  return NextResponse.json({ ok: true });
}
