'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useGitHubToken } from '@/contexts/github-token-context';
import { RepositorySelection } from '@/components/repository-selection';
import { TokenSettings } from './components/token-settings';
import { DisplaySettings } from './components/display-settings';
import { AlertSettings } from './components/alert-settings';
import { AccountSettings } from './components/account-settings';
import { UsersSettings } from './components/users-settings';
import { TokenInstructions } from './components/token-instructions';
import { SecuritySection } from './components/security-section';

export default function SettingsPage() {
  const { token, isValidated } = useGitHubToken();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground mt-1">Configure your GitHub token and preferences</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/">← Back to Dashboard</Link>
          </Button>
        </div>

        <div className="grid gap-6 max-w-2xl">
          <TokenSettings />

          {token && isValidated && <RepositorySelection />}

          <DisplaySettings />
          <AlertSettings />
          <AccountSettings />
          <UsersSettings />
          <TokenInstructions />
          <SecuritySection />
        </div>
      </div>
    </div>
  );
}
