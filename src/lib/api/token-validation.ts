import { GitHubApiClient } from './github';
import type { GitHubRateLimit } from './types';

export interface TokenValidationResult {
  isValid: boolean;
  user?: {
    login: string;
    name: string | null;
    avatar_url: string;
  };
  scopes?: string[];
  rateLimit?: GitHubRateLimit;
  error?: string;
}

/**
 * Validate a GitHub personal access token by calling /user.
 * Returns the authenticated identity, token scopes and rate-limit state.
 */
export async function validateGitHubToken(token: string): Promise<TokenValidationResult> {
  if (!token || token.trim().length === 0) {
    return { isValid: false, error: 'Token is required' };
  }

  if (!isValidTokenFormat(token)) {
    return {
      isValid: false,
      error: 'Token format is not recognised. Expected a GitHub personal access token.',
    };
  }

  try {
    const client = new GitHubApiClient(token);
    const details = await client.getTokenDetails();

    return {
      isValid: true,
      user: {
        login: details.user.login,
        name: details.user.name,
        avatar_url: details.user.avatar_url,
      },
      scopes: details.scopes,
      rateLimit: details.rateLimit,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred during token validation',
    };
  }
}

/**
 * Basic offline format check. This is a UX guard only; the API remains the
 * source of truth for whether a token is valid.
 */
export function isValidTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') return false;

  const trimmed = token.trim();
  if (trimmed.length > 512) return false;

  // Fine-grained (github_pat_), classic (ghp_), server-to-server (ghs_),
  // user-to-server (ghu_) and OAuth (gho_) tokens.
  if (/^(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})$/.test(trimmed)) {
    return true;
  }

  // Very old classic tokens were 40 hex characters.
  return /^[a-f0-9]{40}$/i.test(trimmed);
}

/**
 * Scopes that are far broader than a read-only dashboard needs. Surfaced in
 * the UI so users can switch to a least-privilege fine-grained token.
 */
export function findExcessiveScopes(scopes: string[]): string[] {
  const risky = [
    'admin:org',
    'admin:public_key',
    'admin:repo_hook',
    'delete_repo',
    'write:packages',
    'delete:packages',
    'write:org',
    'manage_runners:org',
  ];
  return scopes.filter((scope) => risky.includes(scope));
}
