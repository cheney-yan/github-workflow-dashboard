'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useGitHubToken } from '@/contexts/github-token-context';
import { findExcessiveScopes } from '@/lib/api/token-validation';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export function TokenSettings() {
  const {
    token,
    isValidated,
    isLoading,
    error,
    setToken,
    removeToken,
    isSecureStorageSupported,
    scopes,
    rateLimit,
  } = useGitHubToken();

  const [tokenInput, setTokenInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const excessiveScopes = findExcessiveScopes(scopes);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tokenInput.trim()) return;

    setIsSubmitting(true);
    try {
      await setToken(tokenInput.trim());
      setTokenInput('');
    } catch {
      // The context exposes the validation error.
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (confirm('Are you sure you want to remove the GitHub token?')) {
      await removeToken();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          GitHub Token
          <div className="flex items-center gap-2">
            {!isSecureStorageSupported && (
              <Badge variant="destructive" className="text-xs">Secure storage not supported</Badge>
            )}
            {token && isValidated && <Badge variant="default" className="text-xs">Valid Token</Badge>}
            {token && !isValidated && !isLoading && (
              <Badge variant="destructive" className="text-xs">Invalid Token</Badge>
            )}
            {isLoading && <Badge variant="secondary" className="text-xs">Validating...</Badge>}
          </div>
        </CardTitle>
        <CardDescription>
          Enter your GitHub Personal Access Token to monitor workflows.
          <br />
          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Create a token on GitHub →
          </a>
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-4">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {!isSecureStorageSupported && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3 mb-4">
            <p className="text-yellow-700 dark:text-yellow-300 text-sm">
              ⚠️ Secure storage is not available in your browser. Tokens will only persist for this session.
            </p>
          </div>
        )}

        {token ? (
          <div className="space-y-4">
            <div>
              <Label>Current Token</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="password"
                  value="••••••••••••••••"
                  readOnly
                  aria-label="Stored GitHub token (hidden)"
                  className="flex-1"
                />
                <Button variant="destructive" onClick={handleRemove} disabled={isLoading}>
                  Remove
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                The token is never displayed again. It is encrypted with AES-256-GCM and a random
                per-browser key stored in IndexedDB.
              </p>
            </div>

            {(scopes.length > 0 || rateLimit) && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  <span className="font-medium">Token permissions</span>
                  {scopes.length > 0 ? (
                    scopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="text-[11px]">{scope}</Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">
                      Fine-grained token (scopes are managed per repository)
                    </span>
                  )}
                </div>
                {rateLimit && rateLimit.limit > 0 && (
                  <p className="mt-2 text-muted-foreground">
                    GitHub API quota: {rateLimit.remaining.toLocaleString()} of{' '}
                    {rateLimit.limit.toLocaleString()} requests remaining
                    {rateLimit.reset > 0 &&
                      ` · resets ${new Date(rateLimit.reset * 1000).toLocaleTimeString()}`}
                  </p>
                )}
              </div>
            )}

            {excessiveScopes.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" aria-hidden="true" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    This token has more access than the dashboard needs
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Remove {excessiveScopes.join(', ')} and use a read-only token scoped to the
                    repositories you monitor.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-4 border-t">
              <Label>Update Token</Label>
              <form onSubmit={handleSubmit} className="mt-2">
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="github_pat_… or ghp_…"
                    value={tokenInput}
                    onChange={(event) => setTokenInput(event.target.value)}
                    disabled={isSubmitting}
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={isSubmitting || !tokenInput.trim()}>
                    {isSubmitting ? 'Updating...' : 'Update'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="token">GitHub Personal Access Token</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  disabled={isSubmitting}
                  className="mt-1"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Recommended: fine-grained token with{' '}
                  <code className="bg-muted px-1 rounded">Actions: Read</code>,{' '}
                  <code className="bg-muted px-1 rounded">Contents: Read</code> and{' '}
                  <code className="bg-muted px-1 rounded">Metadata: Read</code>.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting || !tokenInput.trim()}>
                {isSubmitting ? 'Validating...' : 'Save Token'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
