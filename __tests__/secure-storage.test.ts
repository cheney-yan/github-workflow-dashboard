import 'fake-indexeddb/auto';
import {
  STORAGE_KEYS,
  clearAllSecureStorage,
  getSecureItem,
  isSecureStorageAvailable,
  removeSecureItem,
  setSecureItem,
} from '../src/lib/storage/secure-storage';

const DB_NAME = 'github-workflow-monitor';
const TOKEN = 'ghp_super_secret_token_value_1234567890';

async function resetDatabases() {
  localStorage.clear();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function storageDump(): string {
  const dump: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key) dump[key] = localStorage.getItem(key) ?? '';
  }
  return JSON.stringify(dump);
}

describe('secure storage', () => {
  beforeEach(async () => {
    await resetDatabases();
  });

  it('reports availability when WebCrypto, IndexedDB and localStorage work', async () => {
    await expect(isSecureStorageAvailable()).resolves.toBe(true);
  });

  it('round-trips a value', async () => {
    await setSecureItem(STORAGE_KEYS.GITHUB_TOKEN, TOKEN);
    await expect(getSecureItem(STORAGE_KEYS.GITHUB_TOKEN)).resolves.toBe(TOKEN);
  });

  it('never writes the plaintext token to localStorage', async () => {
    await setSecureItem(STORAGE_KEYS.GITHUB_TOKEN, TOKEN);

    const raw = localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain(TOKEN);
    expect(storageDump()).not.toContain(TOKEN);

    const payload = JSON.parse(raw as string);
    expect(payload).toMatchObject({ v: 2, alg: 'AES-GCM' });
    expect(payload.encrypted).toBeUndefined();
    expect(typeof payload.data).toBe('string');
    expect(typeof payload.salt).toBe('string');
    expect(typeof payload.iv).toBe('string');
  });

  it('uses a fresh IV for every write', async () => {
    await setSecureItem(STORAGE_KEYS.GITHUB_TOKEN, TOKEN);
    const first = JSON.parse(localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN) as string);

    await setSecureItem(STORAGE_KEYS.GITHUB_TOKEN, TOKEN);
    const second = JSON.parse(localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN) as string);

    expect(first.iv).not.toBe(second.iv);
    expect(first.data).not.toBe(second.data);
  });

  it('binds ciphertext to its storage key', async () => {
    await setSecureItem(STORAGE_KEYS.GITHUB_TOKEN, TOKEN);
    const ciphertext = localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN) as string;
    localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, ciphertext);

    await expect(getSecureItem(STORAGE_KEYS.USER_PREFERENCES)).resolves.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES)).toBeNull();
  });

  it('removes tampered ciphertext instead of returning garbage', async () => {
    await setSecureItem(STORAGE_KEYS.GITHUB_TOKEN, TOKEN);
    const payload = JSON.parse(localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN) as string);
    payload.data = `${payload.data.slice(0, -4)}AAAA`;
    localStorage.setItem(STORAGE_KEYS.GITHUB_TOKEN, JSON.stringify(payload));

    await expect(getSecureItem(STORAGE_KEYS.GITHUB_TOKEN)).resolves.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN)).toBeNull();
  });

  it('removes malformed payloads', async () => {
    localStorage.setItem(STORAGE_KEYS.GITHUB_TOKEN, '{"v":2,"alg":"AES-GCM"}');
    await expect(getSecureItem(STORAGE_KEYS.GITHUB_TOKEN)).resolves.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN)).toBeNull();
  });

  it('deletes legacy fingerprint-encrypted values instead of decrypting them', async () => {
    localStorage.setItem(
      STORAGE_KEYS.GITHUB_TOKEN,
      JSON.stringify({ encrypted: [1, 2, 3], salt: [1], iv: [1] })
    );

    await expect(getSecureItem(STORAGE_KEYS.GITHUB_TOKEN)).resolves.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN)).toBeNull();
  });

  it('removes a single value', async () => {
    await setSecureItem(STORAGE_KEYS.GITHUB_TOKEN, TOKEN);
    removeSecureItem(STORAGE_KEYS.GITHUB_TOKEN);
    expect(localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN)).toBeNull();
  });

  it('clears every application value', async () => {
    await setSecureItem(STORAGE_KEYS.GITHUB_TOKEN, TOKEN);
    await setSecureItem(STORAGE_KEYS.SELECTED_REPOSITORIES, '[]');
    localStorage.setItem('github-flow-dashboard-theme', 'dark');

    clearAllSecureStorage();

    expect(localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.SELECTED_REPOSITORIES)).toBeNull();
    expect(localStorage.getItem('github-flow-dashboard-theme')).toBeNull();
  });

  it('exposes every key used by the app', () => {
    expect(Object.values(STORAGE_KEYS)).toEqual(
      expect.arrayContaining([
        'github_flow_dashboard_token',
        'github_flow_dashboard_user_id',
        'github_flow_dashboard_token_scopes',
        'github_flow_dashboard_selected_repos',
      ])
    );
  });
});
