/**
 * GitHub Token Context
 * Manages GitHub token state and provides secure storage integration
 */
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  setSecureItem,
  getSecureItem,
  removeSecureItem,
  isSecureStorageAvailable,
  STORAGE_KEYS,
} from '@/lib/storage/secure-storage';
import { validateGitHubToken } from '@/lib/api/token-validation';
import type { GitHubRateLimit } from '@/lib/api/types';

interface GitHubTokenContextType {
  token: string | null;
  isValidated: boolean;
  isLoading: boolean;
  error: string | null;
  userId?: string | null;
  scopes: string[];
  rateLimit: GitHubRateLimit | null;
  setToken: (token: string) => Promise<void>;
  removeToken: () => Promise<void>;
  validateToken: () => Promise<boolean>;
  isSecureStorageSupported: boolean;
}

const GitHubTokenContext = createContext<GitHubTokenContextType | undefined>(undefined);

interface GitHubTokenProviderProps {
  children: ReactNode;
}

export function GitHubTokenProvider({ children }: GitHubTokenProviderProps) {
  const [token, setTokenState] = useState<string | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSecureStorageSupported, setIsSecureStorageSupported] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [rateLimit, setRateLimit] = useState<GitHubRateLimit | null>(null);

  const persist = useCallback(
    async (key: string, value: string, available: boolean) => {
      if (!available) return;
      await setSecureItem(key, value);
    },
    []
  );

  // Check storage availability and restore the session in one pass.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const available = await isSecureStorageAvailable();
      if (cancelled) return;
      setIsSecureStorageSupported(available);

      if (!available) {
        // The server-side account store can still provide a token even when
        // browser storage is unavailable.
        try {
          const response = await fetch('/api/auth/token', { credentials: 'same-origin' });
          if (response.ok) {
            const data = (await response.json()) as { token: string | null };
            if (data.token) {
              setTokenState(data.token);
              const validation = await validateGitHubToken(data.token);
              setIsValidated(validation.isValid);
              if (validation.user?.login) setUserId(validation.user.login);
            }
          }
        } catch {
          // Ignore; the user can sign in and add a token.
        }
        setIsLoading(false);
        return;
      }

      try {
        const [storedToken, storedUserId, storedScopes] = await Promise.all([
          getSecureItem(STORAGE_KEYS.GITHUB_TOKEN),
          getSecureItem(STORAGE_KEYS.GITHUB_USER_ID),
          getSecureItem(STORAGE_KEYS.GITHUB_TOKEN_SCOPES),
        ]);
        if (cancelled) return;

        let serverToken: string | null = null;
        try {
          const response = await fetch('/api/auth/token', { credentials: 'same-origin' });
          if (response.ok) {
            const data = (await response.json()) as { token: string | null };
            serverToken = data.token;
          }
        } catch {
          // Fall back to local storage below.
        }
        if (cancelled) return;

        const candidate = serverToken || storedToken;
        if (!candidate) {
          setIsLoading(false);
          return;
        }

        setTokenState(candidate);
        if (storedUserId) setUserId(storedUserId);
        if (storedScopes) {
          try {
            const parsed = JSON.parse(storedScopes);
            if (Array.isArray(parsed)) setScopes(parsed.filter((s) => typeof s === 'string'));
          } catch {
            // Ignore malformed cached scopes; they are refreshed below.
          }
        }

        const validation = await validateGitHubToken(candidate);
        if (cancelled) return;

        setIsValidated(validation.isValid);
        if (!validation.isValid) {
          setError('Stored token is no longer valid. Add a new token to continue.');
        } else {
          if (validation.scopes) {
            setScopes(validation.scopes);
            await persist(STORAGE_KEYS.GITHUB_TOKEN_SCOPES, JSON.stringify(validation.scopes), available);
          }
          if (validation.rateLimit) setRateLimit(validation.rateLimit);
          if (validation.user?.login) {
            setUserId(validation.user.login);
            await persist(STORAGE_KEYS.GITHUB_USER_ID, validation.user.login, available);
          }
          // Migrate a locally stored token into the signed-in account once.
          if (!serverToken && storedToken) {
            await fetch('/api/auth/token', {
              method: 'PUT',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: storedToken }),
            }).catch(() => undefined);
          }
        }
      } catch {
        if (!cancelled) setError('Failed to load the stored token.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  const setToken = useCallback(
    async (newToken: string): Promise<void> => {
      setError(null);
      setIsLoading(true);

      try {
        const validation = await validateGitHubToken(newToken);
        if (!validation.isValid) {
          throw new Error(validation.error || 'Invalid GitHub token');
        }

        await persist(STORAGE_KEYS.GITHUB_TOKEN, newToken, isSecureStorageSupported);
        if (validation.user?.login) {
          await persist(STORAGE_KEYS.GITHUB_USER_ID, validation.user.login, isSecureStorageSupported);
          setUserId(validation.user.login);
        }
        if (validation.scopes) {
          setScopes(validation.scopes);
          await persist(
            STORAGE_KEYS.GITHUB_TOKEN_SCOPES,
            JSON.stringify(validation.scopes),
            isSecureStorageSupported
          );
        }
        if (validation.rateLimit) setRateLimit(validation.rateLimit);

        const saved = await fetch('/api/auth/token', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: newToken }),
        });
        if (!saved.ok) {
          throw new Error('Token validated but could not be saved to your account.');
        }

        setTokenState(newToken);
        setIsValidated(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to set token';
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [isSecureStorageSupported, persist]
  );

  const removeToken = useCallback(async (): Promise<void> => {
    setError(null);

    try {
      await fetch('/api/auth/token', {
        method: 'DELETE',
        credentials: 'same-origin',
      }).catch(() => undefined);
      if (isSecureStorageSupported) {
        removeSecureItem(STORAGE_KEYS.GITHUB_TOKEN);
        removeSecureItem(STORAGE_KEYS.GITHUB_USER_ID);
        removeSecureItem(STORAGE_KEYS.GITHUB_TOKEN_SCOPES);
        removeSecureItem(STORAGE_KEYS.SELECTED_REPOSITORIES);
      }
      setTokenState(null);
      setUserId(null);
      setScopes([]);
      setRateLimit(null);
      setIsValidated(false);
    } catch {
      setError('Failed to remove token');
    }
  }, [isSecureStorageSupported]);

  const validateToken = useCallback(async (): Promise<boolean> => {
    if (!token) {
      setIsValidated(false);
      return false;
    }

    setError(null);
    setIsLoading(true);

    try {
      const validation = await validateGitHubToken(token);
      setIsValidated(validation.isValid);

      if (!validation.isValid) {
        setError(validation.error || 'Token validation failed');
        return false;
      }

      if (validation.scopes) setScopes(validation.scopes);
      if (validation.rateLimit) setRateLimit(validation.rateLimit);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token validation failed');
      setIsValidated(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const contextValue: GitHubTokenContextType = {
    token,
    isValidated,
    isLoading,
    error,
    userId,
    scopes,
    rateLimit,
    setToken,
    removeToken,
    validateToken,
    isSecureStorageSupported,
  };

  return (
    <GitHubTokenContext.Provider value={contextValue}>
      {children}
    </GitHubTokenContext.Provider>
  );
}

export function useGitHubToken(): GitHubTokenContextType {
  const context = useContext(GitHubTokenContext);
  if (context === undefined) {
    throw new Error('useGitHubToken must be used within a GitHubTokenProvider');
  }
  return context;
}
