/**
 * Low-level encrypted storage primitives.
 *
 * The encryption material is a random 256-bit secret kept in IndexedDB. Keys
 * are derived per item with HKDF and used with AES-256-GCM. Nothing here
 * touches localStorage; the secure-storage facade owns that.
 */

const DB_NAME = 'github-workflow-monitor';
const DB_VERSION = 1;
const SECRET_STORE = 'secrets';
const DEVICE_SECRET_ID = 'device-secret-v2';
const FORMAT_VERSION = 2;
const HKDF_INFO = 'github-workflow-monitor/storage/v2';

export interface EncryptedPayload {
  v: number;
  alg: 'AES-GCM';
  iv: string;
  salt: string;
  data: string;
  createdAt: number;
}

export function getCrypto(): Crypto | null {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  return null;
}

function getIndexedDB(): IDBFactory | null {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.indexedDB) {
      return globalThis.indexedDB;
    }
  } catch {
    // IndexedDB can be disabled by policy.
  }
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string') throw new Error('Invalid base64 value');
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function openDatabase(): Promise<IDBDatabase> {
  const idb = getIndexedDB();
  if (!idb) return Promise.reject(new Error('IndexedDB is not available'));

  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SECRET_STORE)) {
        db.createObjectStore(SECRET_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
}

function readSecret(db: IDBDatabase): Promise<ArrayBuffer | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SECRET_STORE, 'readonly');
    const request = transaction.objectStore(SECRET_STORE).get(DEVICE_SECRET_ID);
    request.onsuccess = () => resolve(request.result as ArrayBuffer | undefined);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
  });
}

function writeSecret(db: IDBDatabase, secret: Uint8Array<ArrayBuffer>): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SECRET_STORE, 'readwrite');
    const buffer = secret.buffer.slice(
      secret.byteOffset,
      secret.byteOffset + secret.byteLength
    ) as ArrayBuffer;
    transaction.objectStore(SECRET_STORE).put(buffer, DEVICE_SECRET_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'));
  });
}

let deviceSecretPromise: Promise<Uint8Array<ArrayBuffer>> | null = null;

async function loadOrCreateDeviceSecret(crypto: Crypto): Promise<Uint8Array<ArrayBuffer>> {
  const db = await openDatabase();
  try {
    const existing = await readSecret(db);
    if (existing && existing.byteLength >= 32) return new Uint8Array(existing);

    const secret = crypto.getRandomValues(new Uint8Array(32));
    await writeSecret(db, secret);
    return secret;
  } finally {
    db.close();
  }
}

async function getOrCreateDeviceSecret(crypto: Crypto): Promise<Uint8Array<ArrayBuffer>> {
  if (!deviceSecretPromise) {
    deviceSecretPromise = loadOrCreateDeviceSecret(crypto).catch((error) => {
      deviceSecretPromise = null;
      throw error;
    });
  }
  return deviceSecretPromise;
}

async function deriveItemKey(
  crypto: Crypto,
  secret: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode(HKDF_INFO),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptValue(key: string, value: string): Promise<EncryptedPayload> {
  const crypto = getCrypto();
  if (!crypto) throw new Error('Secure storage is not available in this browser');

  const secret = await getOrCreateDeviceSecret(crypto);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const derivedKey = await deriveItemKey(crypto, secret, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(key) },
    derivedKey,
    new TextEncoder().encode(value)
  );

  return {
    v: FORMAT_VERSION,
    alg: 'AES-GCM',
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    data: bytesToBase64(new Uint8Array(encrypted)),
    createdAt: Date.now(),
  };
}

export async function decryptValue(key: string, payload: EncryptedPayload): Promise<string> {
  const crypto = getCrypto();
  if (!crypto) throw new Error('Secure storage is not available in this browser');
  if (payload.v !== FORMAT_VERSION || payload.alg !== 'AES-GCM') {
    throw new Error('Unsupported storage format');
  }

  const secret = await getOrCreateDeviceSecret(crypto);
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  if (salt.byteLength !== 32 || iv.byteLength !== 12) throw new Error('Invalid storage format');

  const derivedKey = await deriveItemKey(crypto, secret, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(key) },
    derivedKey,
    base64ToBytes(payload.data)
  );

  return new TextDecoder().decode(decrypted);
}

/** Probe WebCrypto + IndexedDB without creating the device secret. */
export async function isCryptoStoreAvailable(): Promise<boolean> {
  if (!getCrypto() || !getIndexedDB()) return false;
  try {
    const db = await openDatabase();
    db.close();
    return true;
  } catch {
    return false;
  }
}
