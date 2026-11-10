import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/session';
import { toPublicUser } from '@/lib/auth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ user: toPublicUser(user) });
}
