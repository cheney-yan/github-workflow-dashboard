/**
 * Secure Storage
 *
 * Persists sensitive values (the GitHub token and the selected repositories)
 * with AES-256-GCM. The encryption material is a random 256-bit secret stored
 * in IndexedDB, never in localStorage and never derived from a predictable
 * browser fingerprint.
 *
 * Threat model
 * ------------
 * - An attacker who can dump localStorage (shared machine, backup, extension
 *   with storage access) only sees authenticated ciphertext.
 * - An attacker with full script execution on the origin (XSS) can still ask
 *   this module to decrypt. The CSP and the lack of user-controlled HTML are
 *   the controls for that scenario. No client-only scheme can defend against
 *   arbitrary same-origin script execution.
 * - Values are bound to their storage key through AES-GCM additional data, so
 *   a ciphertext cannot be copied from one key to another.
 *
 * Version 1 blobs (fingerprint-derived key) are intentionally not decrypted:
 * that scheme was publicly derivable. They are deleted so a user re-enters the
 * token into the v2 format instead of trusting old ciphertext.
 */

import {
  decryptValue,
  encryptValue,
  getCrypto,
  isCryptoStoreAvailable,
  type EncryptedPayload,
} from './storage-crypto';

export const STORAGE_KEYS = {
  GITHUB_TOKEN: 'github_flow_dashboard_token',
  GITHUB_USER_ID: 'github_flow_dashboard_user_id',
  GITHUB_TOKEN_SCOPES: 'github_flow_dashboard_token_scopes',
  SELECTED_REPOSITORIES: 'github_flow_dashboard_selected_repos',
  USER_PREFERENCES: 'github_flow_dashboard_preferences',
  LAST_SYNC: 'github_flow_dashboard_last_sync',
} as const;

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // Access can throw in private mode / blocked-cookie contexts.
  }
  return null;
}

/** Check whether encrypted persistence is possible in this browser. */
export async function isSecureStorageAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!getCrypto() || !getLocalStorage()) return false;

  try {
    const testKey = '__gwm_storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return await isCryptoStoreAvailable();
  } catch {
    return false;
  }
}

/** Encrypt and persist a value in localStorage. */
export async function setSecureItem(key: string, value: string): Promise<void> {
  const localStorage = getLocalStorage();
  if (!localStorage) throw new Error('Secure storage is not available in this browser');

  const payload = await encryptValue(key, value);
  localStorage.setItem(key, JSON.stringify(payload));
}

/**
 * Read and decrypt a value. Returns null when the value is missing or cannot
 * be authenticated; corrupted or unsupported entries are deleted.
 */
export async function getSecureItem(key: string): Promise<string | null> {
  const localStorage = getLocalStorage();
  if (!localStorage || !getCrypto()) return null;

  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    const payload = JSON.parse(stored) as Partial<EncryptedPayload> | null;
    if (!payload || !('v' in payload)) {
      localStorage.removeItem(key);
      return null;
    }
    return await decryptValue(key, payload as EncryptedPayload);
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

/** Remove a single value. */
export function removeSecureItem(key: string): void {
  try {
    getLocalStorage()?.removeItem(key);
  } catch {
    // Ignore storage removal failures.
  }
}

/** Remove every value owned by this application. */
export function clearAllSecureStorage(): void {
  Object.values(STORAGE_KEYS).forEach(removeSecureItem);
  try {
    getLocalStorage()?.removeItem('github-flow-dashboard-last-org');
    getLocalStorage()?.removeItem('github-flow-dashboard-settings');
    getLocalStorage()?.removeItem('github-flow-dashboard-theme');
  } catch {
    // Ignore storage removal failures.
  }
}
