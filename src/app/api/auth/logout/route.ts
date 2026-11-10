import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  const cookie = clearSessionCookie(request);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
