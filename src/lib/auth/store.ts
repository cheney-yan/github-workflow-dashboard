import { promises as fs } from 'fs';
import path from 'path';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024, keylen: 64 };
const DEFAULT_ADMIN = { username: 'admin', password: 'changeme' };

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  githubToken: string | null;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  hasToken: boolean;
}

interface Database {
  version: 1;
  users: StoredUser[];
}

function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), '.data');
}

function usersFile(): string {
  return path.join(dataDir(), 'users.json');
}

function keyFile(): string {
  return path.join(dataDir(), 'server.key');
}

let writeQueue: Promise<unknown> = Promise.resolve();

function withLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

let cachedKey: Buffer | null = null;

export async function getServerKey(): Promise<Buffer> {
  if (process.env.APP_SECRET) {
    return createHash('sha256').update(process.env.APP_SECRET).digest();
  }
  if (cachedKey) return cachedKey;

  await fs.mkdir(dataDir(), { recursive: true, mode: 0o700 });
  try {
    const existing = await fs.readFile(keyFile());
    if (existing.length === 32) {
      cachedKey = existing;
      return existing;
    }
  } catch {
    // Create below.
  }

  const key = randomBytes(32);
  await fs.writeFile(keyFile(), key, { mode: 0o600 });
  cachedKey = key;
  return key;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split(':');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT.maxmem,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function encryptToken(userId: string, token: string): Promise<string> {
  const key = await getServerKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`user:${userId}`, 'utf8'));
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

async function decryptToken(userId: string, payload: string): Promise<string | null> {
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(':');
    if (version !== 'v1') return null;
    const key = await getServerKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAAD(Buffer.from(`user:${userId}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

async function writeDb(db: Database): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true, mode: 0o700 });
  const temporary = `${usersFile()}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(db, null, 2), { mode: 0o600 });
  await fs.rename(temporary, usersFile());
}

async function readDb(): Promise<Database> {
  try {
    const raw = await fs.readFile(usersFile(), 'utf8');
    const parsed = JSON.parse(raw) as Database;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.users)) {
      throw new Error('Unsupported user store format');
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const admin: StoredUser = {
      id: randomUUID(),
      username: DEFAULT_ADMIN.username,
      passwordHash: await hashPassword(DEFAULT_ADMIN.password),
      isAdmin: true,
      mustChangePassword: true,
      githubToken: null,
      createdAt: new Date().toISOString(),
    };
    const db: Database = { version: 1, users: [admin] };
    await writeDb(db);
    return db;
  }
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    mustChangePassword: user.mustChangePassword,
    hasToken: Boolean(user.githubToken),
  };
}

export async function findUserByUsername(username: string): Promise<StoredUser | null> {
  const db = await readDb();
  return db.users.find((user) => user.username.toLowerCase() === username.toLowerCase()) ?? null;
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const db = await readDb();
  return db.users.find((user) => user.id === id) ?? null;
}

export async function listUsers(): Promise<PublicUser[]> {
  const db = await readDb();
  return db.users.map(toPublicUser);
}

export async function createUser(
  username: string,
  password: string,
  isAdmin = false
): Promise<PublicUser> {
  return withLock(async () => {
    const db = await readDb();
    if (db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Username already exists');
    }
    const user: StoredUser = {
      id: randomUUID(),
      username,
      passwordHash: await hashPassword(password),
      isAdmin,
      mustChangePassword: true,
      githubToken: null,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    await writeDb(db);
    return toPublicUser(user);
  });
}

export async function changePassword(
  userId: string,
  newPassword: string
): Promise<boolean> {
  return withLock(async () => {
    const db = await readDb();
    const user = db.users.find((entry) => entry.id === userId);
    if (!user) return false;
    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    await writeDb(db);
    return true;
  });
}

export async function setUserToken(userId: string, token: string | null): Promise<boolean> {
  return withLock(async () => {
    const db = await readDb();
    const user = db.users.find((entry) => entry.id === userId);
    if (!user) return false;
    user.githubToken = token ? await encryptToken(user.id, token) : null;
    await writeDb(db);
    return true;
  });
}

export async function getUserToken(user: StoredUser): Promise<string | null> {
  if (!user.githubToken) return null;
  return decryptToken(user.id, user.githubToken);
}
