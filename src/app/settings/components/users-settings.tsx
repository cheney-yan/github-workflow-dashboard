'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/auth-context';
import { Loader, Users } from 'lucide-react';

interface UserRow {
  id: string;
  username: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  hasToken: boolean;
}

export function UsersSettings() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/users', { credentials: 'same-origin' });
      if (!response.ok) return;
      const data = (await response.json()) as { users: UserRow[] };
      setUsers(data.users);
    } catch {
      // Non-admin or offline; the card simply stays hidden.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time admin list load
    if (user?.isAdmin) void load();
  }, [load, user?.isAdmin]);

  if (!user?.isAdmin) return null;

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/auth/users', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create user');
      }
      setUsername('');
      setPassword('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" /> Users
        </CardTitle>
        <CardDescription>
          Each account keeps its own encrypted GitHub token. New users must change their password
          at first sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {users === null ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader className="w-3 h-3 animate-spin" /> Loading users…
          </p>
        ) : (
          <div className="space-y-2">
            {users.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{entry.username}</span>
                {entry.isAdmin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                {entry.mustChangePassword && (
                  <Badge variant="outline" className="text-xs">Password change pending</Badge>
                )}
                {entry.hasToken && <Badge variant="outline" className="text-xs">Token saved</Badge>}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={create} className="space-y-3 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-username">Username</Label>
              <Input
                id="new-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                minLength={3}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-user-password">Bootstrap password</Label>
              <Input
                id="new-user-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={10}
                required
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Creating…' : 'Create user'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
