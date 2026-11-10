import { createHmac, timingSafeEqual } from 'crypto';
import { findUserById, getServerKey, type StoredUser } from './store';

const COOKIE_NAME = 'gwm_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

interface SessionPayload {
  sub: string;
  exp: number;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

async function signingKey(): Promise<Buffer> {
  const key = await getServerKey();
  return createHmac('sha256', key).update('github-workflow-monitor/session').digest();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const index = part.indexOf('=');
      if (index < 0) return [];
      return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]];
    })
  );
}

export async function createSessionValue(userId: string): Promise<string> {
  const payload: SessionPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const encoded = base64url(JSON.stringify(payload));
  const signature = base64url(
    createHmac('sha256', await signingKey()).update(encoded).digest()
  );
  return `${encoded}.${signature}`;
}

async function readSessionValue(value: string): Promise<SessionPayload | null> {
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) return null;
  const expected = base64url(
    createHmac('sha256', await signingKey()).update(encoded).digest()
  );
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.sub || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isSecureRequest(request: Request): boolean {
  return request.headers.get('x-forwarded-proto') === 'https';
}

/** HTTPS is required for credentials and tokens, except on localhost. */
export function hasSecureTransport(request: Request): boolean {
  if (isSecureRequest(request)) return true;
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase();
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
}

export function sessionCookie(request: Request, value: string) {
  return {
    name: COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: isSecureRequest(request),
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    },
  };
}

export function clearSessionCookie(request: Request) {
  return {
    name: COOKIE_NAME,
    value: '',
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: isSecureRequest(request),
      path: '/',
      maxAge: 0,
    },
  };
}

export async function currentUser(request: Request): Promise<StoredUser | null> {
  const cookies = parseCookies(request.headers.get('cookie'));
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  const payload = await readSessionValue(raw);
  if (!payload) return null;
  return findUserById(payload.sub);
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Non-browser clients still need a valid session cookie.
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
